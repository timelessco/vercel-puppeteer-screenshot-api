import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import cfCheck from "@/utils/cfCheck";
import { X, INSTAGRAM, YOUTUBE } from "@/utils/utils.js";
import {
  localExecutablePath,
  isDev,
  userAgent,
  remoteExecutablePath,
} from "@/utils/utils.js";

import { PuppeteerBlocker } from "@cliqz/adblocker-puppeteer";
import fetch from "cross-fetch";

export const maxDuration = 300; // sec
export const dynamic = "force-dynamic";

const chromium = require("@sparticuz/chromium-min");
const puppeteer = require("puppeteer-core");

let blocker = null;

async function blockCookieBanners(page) {
  try {
    if (!blocker) {
      console.log("Initializing cookie banner blocker...");
      blocker = await PuppeteerBlocker.fromLists(fetch, [
        // Cookie banners filter list from EasyList
        "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt",
      ]);
      console.log("Cookie banner blocker initialized successfully");
    }

    await blocker.enableBlockingInPage(page);
    console.log("Cookie banner blocking enabled for page");
  } catch (error) {
    console.warn("Failed to initialize cookie blocker:", error.message);
    // Continue without blocker - manual removal will still work
  }
}

async function manualCookieBannerRemoval(page) {
  try {
    await page.evaluate(() => {
      const selectors = [
        // Generic cookie/consent selectors
        '[id*="cookie"]',
        '[class*="cookie"]',
        '[id*="consent"]',
        '[class*="consent"]',
        '[id*="gdpr"]',
        '[class*="gdpr"]',
        '[id*="privacy"]',
        '[class*="privacy"]',

        // Role-based selectors
        'div[role="dialog"]',
        'div[role="alertdialog"]',

        // Common class names
        '.cookie-banner',
        '.consent-banner',
        '.privacy-banner',
        '.gdpr-banner',
        '#cookie-notice',
        '.cookie-notice',

        // Popular consent management platforms
        '.onetrust-banner-sdk', // OneTrust
        '.ot-sdk-container',
        '#didomi-host', // Didomi
        '.didomi-consent-popup',
        '.fc-consent-root', // Funding Choices
        '.fc-dialog-container',
        '.cmp-banner_banner', // General CMP
        '.cookielaw-banner',
        '.cookie-law-info-bar',

        // Additional patterns
        '[data-testid*="cookie"]',
        '[data-testid*="consent"]',
        '[aria-label*="cookie"]',
        '[aria-label*="consent"]',
        '[aria-describedby*="cookie"]',

        // Fixed position overlays that might be cookie banners
        'div[style*="position: fixed"][style*="z-index"]',

        // Text-based detection for stubborn banners
        '*[class*="accept-all"]',
        '*[class*="accept-cookies"]',
        '*[id*="accept-all"]',
        '*[id*="accept-cookies"]'
      ];

      let removedCount = 0;

      selectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            // Additional validation to avoid removing legitimate content
            if (el && el.parentNode) {
              const text = el.textContent?.toLowerCase() || '';
              const hasKeywords = ['cookie', 'consent', 'privacy', 'gdpr', 'accept', 'reject', 'manage preferences'].some(keyword =>
                text.includes(keyword)
              );

              // Remove if it contains cookie-related keywords or matches specific selectors
              if (hasKeywords || selector.includes('cookie') || selector.includes('consent') || selector.includes('onetrust') || selector.includes('didomi')) {
                el.remove();
                removedCount++;
              }
            }
          });
        } catch (e) {
          // Ignore selector errors
          console.debug(`Error with selector "${selector}":`, e.message);
        }
      });

      // Also look for and remove backdrop/overlay elements that might be related to cookie banners
      const overlays = document.querySelectorAll('div[style*="position: fixed"], div[style*="position: absolute"]');
      overlays.forEach(overlay => {
        const style = window.getComputedStyle(overlay);
        const zIndex = parseInt(style.zIndex) || 0;
        const opacity = parseFloat(style.opacity) || 1;

        // Remove high z-index, semi-transparent overlays that might be cookie banner backdrops
        if (zIndex > 1000 && opacity < 1 && opacity > 0) {
          const text = overlay.textContent?.toLowerCase() || '';
          if (text.includes('cookie') || text.includes('consent') || text.includes('privacy')) {
            overlay.remove();
            removedCount++;
          }
        }
      });

      console.log(`Manual cookie banner removal: ${removedCount} elements removed`);
      return removedCount;
    });
  } catch (error) {
    console.warn("Manual cookie banner removal failed:", error.message);
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  let urlStr = url.searchParams.get("url");
  const fullPageParam = url.searchParams.get("fullpage");
  const fullPage = fullPageParam === "true";



  if (!urlStr) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let browser = null;

  try {
    browser = await puppeteer.launch({
      ignoreDefaultArgs: ["--enable-automation"],
      args: isDev
        ? [
          "--disable-blink-features=AutomationControlled",
          "--disable-features=site-per-process",
          "--disable-site-isolation-trials",
        ]
        : [...chromium.args, "--disable-blink-features=AutomationControlled"],
      executablePath: isDev
        ? localExecutablePath
        : await chromium.executablePath(remoteExecutablePath),
      headless: isDev ? false : "new",
      debuggingPort: isDev ? 9222 : undefined,
    });

    const pages = await browser.pages();
    const page = pages[0];

    await page.setUserAgent(userAgent);
    await page.setViewport({ width: 1080, height: 0, deviceScaleFactor: 2 });

    const preloadFile = fs.readFileSync(
      path.join(process.cwd(), "/src/utils/preload.js"),
      "utf8"
    );
    await page.evaluateOnNewDocument(preloadFile);

    // Suppress expected JS errors
    page.on("pageerror", (err) => {
      if (!err.message.includes("stopPropagation")) {
        console.warn("Page JS error:", err.message);
      }
    });

    // Block noisy 3rd-party scripts and tracking
    await page.setRequestInterception(true);
    const blocked = [
      "googletagmanager",
      "otBannerSdk.js",
      "doubleclick",
      "adnxs.com",
      "google-analytics",
      "googleadservices",
      "facebook.com/tr",
      "connect.facebook.net",
      "hotjar",
      "mixpanel",
      "segment.com"
    ];

    page.on("request", (req) => {
      const url = req.url();
      if (blocked.some((str) => url.includes(str))) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Initialize cookie banner blocking
    await blockCookieBanners(page);

    let screenshot = null;
    let lastError = null;
    let fullPageScreenshot = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Navigation attempt ${attempt} to: ${urlStr}`);

        if (urlStr.includes(YOUTUBE)) {
          // Extract video ID from URL
          const videoId = urlStr.match(/(?:v=|\/)([\w-]{11})/)?.[1];
          if (videoId) {
            // Create  URL
            urlStr = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
          }
        }

        const response = await page.goto(urlStr, {
          waitUntil: "networkidle2",
          timeout: 300_000,
        });

        if (!response || !response.ok()) {
          console.warn(
            `Navigation attempt ${attempt} failed: ${response?.status()} ${response?.statusText()}`
          );
        }

        // Wait for fonts to load
        await page.evaluate(() => document.fonts.ready);

        // Run Cloudflare check
        await cfCheck(page);

        // Manual cookie banner removal as fallback
        await manualCookieBannerRemoval(page);

        for (let shotTry = 1; shotTry <= 2; shotTry++) {
          try {
            console.log(`Taking screenshot attempt ${shotTry}`);
            let screenshotTarget = null;

            //instagram.com
            if (urlStr.includes(INSTAGRAM)) { 
                await page.keyboard.press("Escape");
                try {
                  await page.waitForSelector('div[role="dialog"]', { hidden: true, timeout: 2000 });
                } catch (e) {
                  console.warn("[role='dialog'] did not close after Escape — continuing anyway");
                }

                const imgs = await page.$$("article img");
                console.log(imgs);

                const img = imgs[1];
                screenshotTarget = img;
            }

            //x.com
            if (urlStr.includes(X)) {
              await page.setViewport({ width: 400, height: 0, deviceScaleFactor: 2 });
              screenshotTarget = await page.$("article");
            }

            if (urlStr.includes(YOUTUBE)) {
              const img = await page.$("img");
              if (img) screenshotTarget = img;
            }

            if (screenshotTarget) {
              console.log("Target found. Taking screenshot..." + fullPage);
              await page.evaluate(() => {
                window.scrollTo(0, 1920);
              });
              await new Promise((res) => setTimeout(res, 1000));
              screenshot = await screenshotTarget.screenshot({ type: "png", deviceScaleFactor: 2 });
            } else {
              console.warn("Target not found. Taking full-page screenshot instead.");

              await page.evaluate(() => {
                window.scrollTo(0, 1920);
              });
              await new Promise((res) => setTimeout(res, 1000));

              screenshot = await page.screenshot({ type: "png", fullPage: fullPage });
            }

            console.log("Screenshot captured successfully.");
            break; // Exit loop on success

          } catch (err) {
            if (err.message.includes("frame was detached")) {
              console.warn("Screenshot frame detached. Retrying outer flow.");
              break;
            }

            lastError = err;
            console.warn(`Screenshot attempt ${shotTry} failed:`, err.message);
          }
        }

        if (screenshot) break;
      } catch (err) {
        if (err.message.includes("frame was detached")) {
          console.warn("Frame was detached during navigation. Retrying...");
          lastError = err;
          // await new Promise((res) => setTimeout(res, 1000));
        } else {
          throw err;
        }
      }
    }

    if (!screenshot) {
      return NextResponse.json(
        { error: "Failed to capture screenshot", details: lastError?.message },
        { status: 500 }
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", "image/png");
    headers.set("Content-Length", screenshot.length.toString());

    return new NextResponse(screenshot, { status: 200, headers });
  } catch (err) {
    console.error("Fatal error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}