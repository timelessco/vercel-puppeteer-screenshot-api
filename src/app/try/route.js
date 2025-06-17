import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import cfCheck from "@/utils/cfCheck";
import {
  localExecutablePath,
  isDev,
  userAgent,
  remoteExecutablePath,
} from "@/utils/utils.js";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const chromium = require("@sparticuz/chromium-min");
const puppeteer = require("puppeteer-core");

export async function GET(request) {
  const url = new URL(request.url);
  const urlStr = url.searchParams.get("url");

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
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: isDev
        ? localExecutablePath
        : await chromium.executablePath(remoteExecutablePath),
      headless: isDev ? false : "new",
      debuggingPort: isDev ? 9222 : undefined,
    });

    const pages = await browser.pages();
    const page = pages[0];

    await page.setUserAgent(userAgent);
    await page.setViewport({ width: 1920, height: 1080 });

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

    // Optionally block noisy 3rd-party scripts
    await page.setRequestInterception(true);
    const blocked = ["googletagmanager", "otBannerSdk.js", "doubleclick", "adnxs.com"];
    page.on("request", (req) => {
      const url = req.url();
      if (blocked.some((str) => url.includes(str))) {
        req.abort();
      } else {
        req.continue();
      }
    });

    let screenshot = null;
    let lastError = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await page.goto(urlStr, {
          waitUntil: "networkidle2",
          timeout: 300000,
        });

        if (!response || !response.ok()) {
          console.warn(
            `Navigation attempt ${attempt} failed: ${response?.status()} ${response?.statusText()}`
          );
        }

        await page.evaluate(() => document.fonts.ready);

        await page.evaluate(async () => {
          const images = Array.from(document.images);
          await Promise.all(
            images.map((img) => {
              if (img.complete) return;
              return new Promise((res) =>
                img.addEventListener("load", res, { once: true })
              );
            })
          );
        });

        await new Promise((res) => setTimeout(res, 6000));
        await cfCheck(page);

        for (let shotTry = 1; shotTry <= 2; shotTry++) {
          try {
            screenshot = await page.screenshot({ type: "png"});
            break;
          } catch (err) {
            if (err.message.includes("frame was detached")) {
              console.warn("Screenshot frame detached. Retrying outer flow.");
              break;
            }
            lastError = err;
            await new Promise((res) => setTimeout(res, 500));
          }
        }

        if (screenshot) break;
      } catch (err) {
        if (err.message.includes("frame was detached")) {
          console.warn("Frame was detached during navigation. Retrying...");
          lastError = err;
          await new Promise((res) => setTimeout(res, 1000));
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
    if (browser) await browser.close();
  }
}
