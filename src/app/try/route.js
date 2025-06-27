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

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const chromium = require("@sparticuz/chromium-min");
const puppeteer = require("puppeteer-core");

let blocker = null;

// Enhanced stealth configuration
const getStealthArgs = () => [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=VizDisplayCompositor,site-per-process',
  '--disable-site-isolation-trials',
  '--disable-web-security',
  '--disable-features=TranslateUI',
  '--disable-ipc-flooding-protection',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-client-side-phishing-detection',
  '--disable-component-extensions-with-background-pages',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--metrics-recording-only',
  '--no-default-browser-check',
  '--no-pings',
  '--password-store=basic',
  '--use-mock-keychain',
  '--hide-scrollbars',
  '--mute-audio'
];

// Realistic user agents pool
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// Random delay helper
const randomDelay = (min = 1000, max = 3000) => 
  new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

// Enhanced stealth setup for page
async function setupStealthPage(page) {
  // Override webdriver property
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    // Remove webdriver from navigator prototype
    delete Object.getPrototypeOf(navigator).webdriver;
    
    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Cypress.denied }) :
        originalQuery(parameters)
    );
    
    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
    
    // Override chrome property
    window.chrome = {
      runtime: {},
      loadTimes: function() {},
      csi: function() {},
      app: {}
    };
    
    // Override screen properties
    Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
    Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
  });

  // Add realistic viewport jitter
  const viewportWidth = 1080 + Math.floor(Math.random() * 200) - 100;
  const viewportHeight = 1920 + Math.floor(Math.random() * 200) - 100;
  
  await page.setViewport({ 
    width: viewportWidth, 
    height: viewportHeight, 
    deviceScaleFactor: 2 
  });

  // Set random user agent
  await page.setUserAgent(getRandomUserAgent());

  // Add extra headers to look more realistic
  await page.setExtraHTTPHeaders({
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  });

  // Mouse movement simulation
  await page.mouse.move(
    Math.random() * viewportWidth,
    Math.random() * viewportHeight
  );
}

async function simulateHumanBehavior(page) {
  // Random mouse movements
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(
      Math.random() * 1080,
      Math.random() * 1920
    );
    await randomDelay(100, 500);
  }
  
  // Random scroll behavior
  await page.evaluate(() => {
    window.scrollTo(0, Math.random() * 200);
  });
  
  await randomDelay(500, 1500);
  
  // Reset scroll
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
}

async function blockCookieBanners(page) {
  try {
    if (!blocker) {
      console.log("Initializing cookie banner blocker...");
      blocker = await PuppeteerBlocker.fromLists(fetch, [
        "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt",
      ]);
      console.log("Cookie banner blocker initialized successfully");
    }

    await blocker.enableBlockingInPage(page);
    console.log("Cookie banner blocking enabled for page");
  } catch (error) {
    console.warn("Failed to initialize cookie blocker:", error.message);
  }
}

async function manualCookieBannerRemoval(page) {
  try {
    await page.evaluate(() => {
      const selectors = [
        '[id*="cookie"]',
        '[class*="cookie"]',
        '[id*="consent"]',
        '[class*="consent"]',
        '[id*="gdpr"]',
        '[class*="gdpr"]',
        '[id*="privacy"]',
        '[class*="privacy"]',
        'div[role="dialog"]',
        'div[role="alertdialog"]',
        '.cookie-banner',
        '.consent-banner',
        '.privacy-banner',
        '.gdpr-banner',
        '#cookie-notice',
        '.cookie-notice',
        '.onetrust-banner-sdk',
        '.ot-sdk-container',
        '#didomi-host',
        '.didomi-consent-popup',
        '.fc-consent-root',
        '.fc-dialog-container',
        '.cmp-banner_banner',
        '.cookielaw-banner',
        '.cookie-law-info-bar',
        '[data-testid*="cookie"]',
        '[data-testid*="consent"]',
        '[aria-label*="cookie"]',
        '[aria-label*="consent"]',
        '[aria-describedby*="cookie"]',
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
            if (el && el.parentNode) {
              const text = el.textContent?.toLowerCase() || '';
              const hasKeywords = ['cookie', 'consent', 'privacy', 'gdpr', 'accept', 'reject', 'manage preferences'].some(keyword =>
                text.includes(keyword)
              );

              if (hasKeywords || selector.includes('cookie') || selector.includes('consent') || selector.includes('onetrust') || selector.includes('didomi')) {
                el.remove();
                removedCount++;
              }
            }
          });
        } catch (e) {
          console.debug(`Error with selector "${selector}":`, e.message);
        }
      });

      // Remove overlay backdrops
      const overlays = document.querySelectorAll('div[style*="position: fixed"], div[style*="position: absolute"]');
      overlays.forEach(overlay => {
        const style = window.getComputedStyle(overlay);
        const zIndex = parseInt(style.zIndex) || 0;
        const opacity = parseFloat(style.opacity) || 1;

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

async function handleScreenshot(urlStr, fullPage) {
  let browser = null;

  try {
    // Enhanced browser launch with stealth args
    browser = await puppeteer.launch({
      ignoreDefaultArgs: ["--enable-automation"],
      args: isDev ? getStealthArgs() : [...chromium.args, ...getStealthArgs()],
      defaultViewport: null, // Let us set it manually
      executablePath: isDev
        ? localExecutablePath
        : await chromium.executablePath(remoteExecutablePath),
      headless: chromium.headless,
      debuggingPort: isDev ? 9222 : undefined,
    });

    const pages = await browser.pages();
    const page = pages[0];

    // Enhanced stealth setup
    await setupStealthPage(page);

    // Load preload script
    const preloadFile = fs.readFileSync(
      path.join(process.cwd(), "/src/utils/preload.js"),
      "utf8"
    );
    await page.evaluateOnNewDocument(preloadFile);

    // Suppress JS errors
    page.on("pageerror", (err) => {
      if (!err.message.includes("stopPropagation")) {
        console.warn("Page JS error:", err.message);
      }
    });

    // Enhanced request blocking
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
      "segment.com",
      "googlesyndication",
      "adsystem.google.com",
      "amazon-adsystem.com",
      "clarity.ms",
      "fullstory.com"
    ];

    page.on("request", (req) => {
      const url = req.url();
      const resourceType = req.resourceType();
      
      // Block tracking and ads
      if (blocked.some((str) => url.includes(str))) {
        req.abort();
      } 
      // Optionally block images for faster loading (except for main content)
      else if (resourceType === 'image' && !url.includes('img.youtube.com')) {
        // Allow images for screenshot targets
        req.continue();
      } else {
        req.continue();
      }
    });

    // Initialize cookie banner blocking
    await blockCookieBanners(page);

    let screenshot = null;
    let lastError = null;

    // Add initial delay to appear more human
    await randomDelay(1000, 3000);

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Navigation attempt ${attempt} to: ${urlStr}`);

        // Handle YouTube thumbnails
        if (urlStr.includes(YOUTUBE)) {
          const videoId = urlStr.match(/(?:v=|\/)([\w-]{11})/)?.[1];
          if (videoId) {
            urlStr = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
          }
        }

        // Navigate with longer timeout and realistic behavior
        const response = await page.goto(urlStr, {
          waitUntil: "domcontentloaded", // Changed from networkidle2 for faster loading
          timeout: 300_000,
        });

        if (!response || !response.ok()) {
          console.warn(
            `Navigation attempt ${attempt} failed: ${response?.status()} ${response?.statusText()}`
          );
          if (attempt < 2) {
            await randomDelay(2000, 5000);
            continue;
          }
        }

        // Wait for fonts and additional loading
        await page.evaluate(() => document.fonts.ready);
        await randomDelay(1000, 2000);

        // Simulate human behavior
        await simulateHumanBehavior(page);

        // Run Cloudflare check
        await cfCheck(page);

        // Manual cookie banner removal
        await manualCookieBannerRemoval(page);

        // Additional wait after cleanup
        await randomDelay(500, 1500);

        for (let shotTry = 1; shotTry <= 2; shotTry++) {
          try {
            console.log(`Taking screenshot attempt ${shotTry}`);
            let screenshotTarget = null;

            // Multiple escape attempts
            await randomDelay(200, 500);
            await page.keyboard.press("Escape");
            await page.keyboard.press("Escape");

            // Platform-specific targeting
            if (urlStr.includes(INSTAGRAM)) {
              await page.setViewport({ width: 400, height: 1920, deviceScaleFactor: 2 });
              
              screenshotTarget = await page.$("header");
              
              if (urlStr.includes("/reel/") || urlStr.includes("/p/")) {
                const article = await page.$("article");
                if (article) screenshotTarget = article;
              }
            }

            if (urlStr.includes(X)) {
              screenshotTarget = await page.$("article");
            }

            if (urlStr.includes(YOUTUBE)) {
              const img = await page.$("img");
              if (img) screenshotTarget = img;
            }

            if (screenshotTarget) {
              console.log("Target found. Taking screenshot...");
              screenshot = await screenshotTarget.screenshot({ 
                type: "png", 
                deviceScaleFactor: 2 
              });
            } else {
              console.warn("Target not found. Taking full-page screenshot instead.");

              // if (fullPage) {
              //   await page.evaluate(async () => {
              //     return await new Promise((resolve) => {
              //       let totalHeight = 0;
              //       const distance = 100;
              //       const timer = setInterval(() => {
              //         const scrollHeight = document.body.scrollHeight;
              //         window.scrollBy(0, distance);
              //         totalHeight += distance;

              //         if (totalHeight >= scrollHeight) {
              //           clearInterval(timer);
              //           window.scrollTo(0, 0);
              //           resolve();
              //         }
              //       }, 100);
              //     });
              //   });
              // }
              window.scrollBy(0, 1920);

             await new Promise(()=>setTimeout(() => { },1000));

              screenshot = await page.screenshot({ 
                type: "png", 
                fullPage: fullPage 
              });
            }

            console.log("Screenshot captured successfully.");
            break;

          } catch (err) {
            if (err.message.includes("frame was detached")) {
              console.warn("Screenshot frame detached. Retrying outer flow.");
              break;
            }

            lastError = err;
            console.warn(`Screenshot attempt ${shotTry} failed:`, err.message);
            await randomDelay(1000, 2000);
          }
        }

        if (screenshot) break;
      } catch (err) {
        if (err.message.includes("frame was detached")) {
          console.warn("Frame was detached during navigation. Retrying...");
          lastError = err;
          await randomDelay(2000, 4000);
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

  } finally {
    if (browser) {
      await browser.close();
    }
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

  let lastError = null;
  
  // Reduced retries with longer delays
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`GET handler attempt ${attempt}`);
      return await handleScreenshot(urlStr, fullPage);
    } catch (err) {
      lastError = err;
      console.warn(`Attempt ${attempt} failed: ${err.message}`);
      if (attempt < 2) {
        await randomDelay(5000, 10000); // Longer delay between retries
      }
    }
  }

  return NextResponse.json({ 
    error: "Failed after retries", 
    details: lastError?.message 
  }, { status: 500 });
}