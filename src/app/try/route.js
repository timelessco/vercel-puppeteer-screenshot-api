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
import { manualCookieBannerRemoval, blockCookieBanners,getScreenshotInstagram } from "@/utils/helpers";

export const maxDuration = 300; // sec
export const dynamic = "force-dynamic";

const chromium = require("@sparticuz/chromium-min");
const puppeteer = require("puppeteer-core");


export async function GET(request) {
  const url = new URL(request.url);
  let urlStr = url?.searchParams.get("url");
  const fullPageParam = url?.searchParams.get("fullpage");
  const fullPage = fullPageParam === "true";
  const url2 = new URL(url?.searchParams.get("url"));
  const imageIndex = url2?.searchParams.get("img_index") || url?.searchParams.get("img_index") || null;


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

    await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 });

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
            await page.keyboard.press("Escape");
            try {
              await page.waitForSelector('div[role="dialog"]', { hidden: true, timeout: 2000 });
            } catch (e) {
              console.warn("[role='dialog'] did not close after Escape — continuing anyway");
            }
            console.log(`Taking screenshot attempt ${shotTry}`);
            let screenshotTarget = null;

            //instagram.com
            if (urlStr.includes(INSTAGRAM)) { 
              const buffer = await getScreenshotInstagram(page, urlStr, imageIndex);

              const headers = new Headers();
              headers.set("Content-Type", "image/png");
              headers.set("Content-Length", buffer?.length.toString());

              return new NextResponse(buffer, { status: 200, headers });
            }

            //x.com
            if (urlStr.includes(X)) {
              screenshotTarget = await page.$("article");
            }

            //youtube.com
            if (urlStr.includes(YOUTUBE)) {
              const img = await page.$("img");
              if (img) screenshotTarget = img;
            }

            if (screenshotTarget) {
              await new Promise((res) => setTimeout(res, 1000));
              screenshot = await screenshotTarget?.screenshot({ type: "png", deviceScaleFactor: 2 });
            } else {
              await new Promise((res) => setTimeout(res, 1000));
              screenshot = await page.screenshot({ type: "png", fullPage: fullPage });
            }

            console.log("Screenshot captured successfully.");
            break; // Exit loop on success

          } catch (err) {
            if (err.message.includes("frame was detached")) {
              break;
            }
            lastError = err;
          }
        }

        if (screenshot) break;
      } catch (err) {
        if (err.message.includes("frame was detached")) {
          lastError = err;
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
    headers.set("Content-Length", screenshot?.length.toString());

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