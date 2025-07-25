import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import cfCheck from "@/utils/cfCheck";
import { X, INSTAGRAM, YOUTUBE, TWITTER } from "@/utils/utils.js";
import {
  localExecutablePath,
  isDev,
  userAgent,
  remoteExecutablePath,
  videoUrlRegex
} from "@/utils/utils.js";
import { manualCookieBannerRemoval, blockCookieBanners, getScreenshotInstagram, getScreenshotX, getScreenshotMp4, getMetadata } from "@/utils/helpers";

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
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--enable-features=NetworkService,NetworkServiceLogging',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-field-trial-config',
          '--disable-back-forward-cache',
          '--enable-unsafe-swiftshader', // For video rendering
          '--use-gl=swiftshader', // Software rendering for videos
          '--ignore-gpu-blacklist',
          '--disable-gpu-sandbox'
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

    // here we check if the url is mp4 or not, by it's content type
    const isMp4 = (await fetch(urlStr).then((res) => res.headers)).get("content-type").startsWith("video/");
    // here we check if the url is mp4 or not, by using regex
    const isVideoUrl = videoUrlRegex.test(urlStr);

    //  since we render the urls in the video tag and take the screenshot, we dont need to worry about the bot detection 
    // Replace this part in your main code:
    if (isMp4 || isVideoUrl) {
      try {
        let screenshot = await getScreenshotMp4(page, urlStr);

        if (screenshot) {
          const headers = new Headers();
          headers.set("Content-Type", "application/json");

          return new NextResponse(JSON.stringify({ screenshot, metaData: null }),
            { status: 200, headers });
        } else {
          // Video screenshot failed, fall back to regular page handling
          console.warn('Video screenshot failed, falling back to regular page screenshot');
        }
      } catch (error) {
        console.error('Video screenshot error:', error);
      }
    }
    await page.setUserAgent(userAgent);

    await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 });
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: "dark" },
    ]);


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
    let metaData = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Navigation attempt ${attempt} to: ${urlStr}`);
        if (urlStr.includes(YOUTUBE)) {
          // here we use the getMetadata function to get the metadata of the video
          metaData = await getMetadata(page, urlStr);
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
            // in instagram we directly take screenshot in the function itself, because for reel we get the og:image
            // to maintain the  same we are returning the buffer 
            //for other we select the html elemnt and take screenshot of it
            if (urlStr.includes(INSTAGRAM)) {
              // here we use the getMetadata function to get the metadata for the post and reel
              metaData = await getMetadata(page, urlStr);
              const buffer = await getScreenshotInstagram(page, urlStr, imageIndex);
              const headers = new Headers();
              headers.set("Content-Type", "application/json");


              return new NextResponse(
                JSON.stringify({ screenshot: buffer, metaData }),
                { status: 200, headers }
              );
            }

            //x.com
            if (urlStr.includes(X) || urlStr.includes(TWITTER)) {
              screenshotTarget = await getScreenshotX(page, urlStr);
            }

            //youtube.com
            if (urlStr.includes(YOUTUBE)) {
              const img = await page.$("img");
              if (img) screenshotTarget = img;
            }

            await page.waitForFunction(() => {
              const challengeFrame = document.querySelector('iframe[src*="challenge"]');
              const title = document.title;
              return !challengeFrame && !title.includes("Just a moment");
            }, { timeout: 15000 }).catch(() => {
              console.warn("Cloudflare challenge may not have cleared");
            });

            // Detect if page has ONLY one video tag as the main content
            const videoElements = await page.$$eval("video", (videos) => videos.length);
            if (videoElements === 1) {
              const videoHandle = await page.$("video");
              if (videoHandle) {
                console.log("Only one <video> tag found. Capturing that element.");
                screenshot = await videoHandle.screenshot({ type: "jpeg"});
              }
            } else if (screenshotTarget) {
              await new Promise((res) => setTimeout(res, urlStr.includes("stackoverflow") ? 10000 : 1000));
              screenshot = await screenshotTarget?.screenshot({ type: "jpeg", deviceScaleFactor: 2 });
            } else {
              await new Promise((res) => setTimeout(res, urlStr.includes("stackoverflow") ? 10000 : 1000));
              screenshot = await page.screenshot({ type: "jpeg", fullPage: fullPage });
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
    headers.set("Content-Type", "application/json");


    return new NextResponse(
      JSON.stringify({ screenshot, metaData }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error("Fatal error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
} 