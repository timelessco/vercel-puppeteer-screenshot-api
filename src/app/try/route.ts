import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";
import chromium from "@sparticuz/chromium-min";
import { launch, type Browser, type Page } from "puppeteer-core";

import cfCheck from "@/utils/puppeteer/cfCheck";
import {
	blockCookieBanners,
	getScreenshotInstagram,
	getScreenshotX,
	manualCookieBannerRemoval,
} from "@/utils/puppeteer/helpers";
import {
	INSTAGRAM,
	isDev,
	localExecutablePath,
	remoteExecutablePath,
	TWITTER,
	userAgent,
	X,
	YOUTUBE,
} from "@/utils/puppeteer/utils";

export const maxDuration = 300;
// Disable caching for this route
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
	const url = new URL(request.url);
	let urlStr = url.searchParams.get("url");
	const fullPageParam = url.searchParams.get("fullpage");
	const fullPage = fullPageParam === "true";

	// Parse image index from query params
	const imageIndex = url.searchParams.get("img_index") ?? null;

	if (!urlStr) {
		return NextResponse.json(
			{ error: "Missing url parameter" },
			{ status: 400 },
		);
	}

	let browser: Browser | null = null;

	try {
		browser = await launch({
			args: isDev
				? [
						"--disable-blink-features=AutomationControlled",
						"--disable-features=site-per-process",
						"--disable-site-isolation-trials",
						"--no-sandbox",
						"--disable-setuid-sandbox",
					]
				: [
						...chromium.args,
						"--disable-blink-features=AutomationControlled",
						"--hide-scrollbars",
						"--disable-web-security",
					],
			debuggingPort: isDev ? 9222 : undefined,
			defaultViewport: {
				height: 1080,
				width: 1920,
			},
			executablePath: isDev
				? localExecutablePath
				: await chromium.executablePath(remoteExecutablePath),
			headless: !isDev,
			ignoreDefaultArgs: ["--enable-automation"],
		});

		const pages = await browser.pages();
		const page: Page = pages[0];

		await page.setUserAgent(userAgent);

		await page.setViewport({
			deviceScaleFactor: 2,
			height: 1200,
			width: 1440,
		});
		await page.emulateMediaFeatures([
			{ name: "prefers-color-scheme", value: "dark" },
		]);

		const preloadFile = fs.readFileSync(
			path.join(process.cwd(), "/src/utils/puppeteer/preload.js"),
			"utf8",
		);
		await page.evaluateOnNewDocument(preloadFile);

		// Suppress expected JS errors
		page.on("pageerror", (err: Error) => {
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
			"segment.com",
		];

		page.on("request", (req) => {
			const requestUrl = req.url();
			if (blocked.some((str) => requestUrl.includes(str))) {
				void req.abort();
			} else {
				void req.continue();
			}
		});

		// Initialize cookie banner blocking
		await blockCookieBanners(page);

		let screenshot: Buffer | null = null;
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= 2; attempt++) {
			try {
				console.log(`Navigation attempt ${attempt} to: ${urlStr}`);

				if (urlStr.includes(YOUTUBE)) {
					// Extract video ID from URL
					const match = /(?:v=|\/)([\w-]{11})/.exec(urlStr);
					const videoId = match?.[1];
					if (videoId) {
						// Create  URL
						urlStr = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
					}
				}

				const response = await page.goto(urlStr, {
					timeout: 300_000,
					waitUntil: "networkidle2",
				});

				if (!response?.ok()) {
					console.warn(
						`Navigation attempt ${attempt} failed: ${response?.status()} ${response?.statusText()}`,
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
							await page.waitForSelector('div[role="dialog"]', {
								hidden: true,
								timeout: 2000,
							});
						} catch {
							// Dialog did not close after Escape — continuing anyway
						}
						console.log(`Taking screenshot attempt ${shotTry}`);
						let screenshotTarget: Awaited<ReturnType<typeof page.$>> | null =
							null;

						// Instagram: Handle special screenshot logic
						if (urlStr.includes(INSTAGRAM)) {
							const buffer = await getScreenshotInstagram(
								page,
								urlStr,
								imageIndex ?? undefined,
							);

							const headers = new Headers();
							headers.set("Content-Type", "image/png");
							headers.set("Content-Length", buffer.length.toString());
							headers.set("Cache-Control", "public, max-age=3600"); // Cache for 1 hour

							return new NextResponse(buffer, {
								headers,
								status: 200,
							});
						}

						// X/Twitter: Get specific tweet element
						if (urlStr.includes(X) || urlStr.includes(TWITTER)) {
							screenshotTarget = await getScreenshotX(page, urlStr);
						}

						// YouTube: Get thumbnail image
						if (urlStr.includes(YOUTUBE)) {
							const img = await page.$("img");
							screenshotTarget = img;
						}

						if (screenshotTarget) {
							await new Promise((res) =>
								setTimeout(
									res,
									urlStr?.includes("stackoverflow") ? 10_000 : 1000,
								),
							);
							screenshot = Buffer.from(
								await screenshotTarget.screenshot({
									type: "png",
								}),
							);
						} else {
							await new Promise((res) =>
								setTimeout(
									res,
									urlStr?.includes("stackoverflow") ? 10_000 : 1000,
								),
							);
							screenshot = Buffer.from(
								await page.screenshot({
									fullPage,
									type: "png",
								}),
							);
						}

						console.log("Screenshot captured successfully.");
						break; // Exit loop on success
					} catch (error) {
						const errorMessage =
							error instanceof Error ? error.message : String(error);
						if (errorMessage.includes("frame was detached")) {
							break;
						}
						lastError =
							error instanceof Error ? error : new Error(errorMessage);
					}
				}

				if (screenshot) break;
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				if (errorMessage.includes("frame was detached")) {
					lastError = error instanceof Error ? error : new Error(errorMessage);
				} else {
					throw error;
				}
			}
		}

		if (!screenshot) {
			return NextResponse.json(
				{
					details: lastError?.message,
					error: "Failed to capture screenshot",
				},
				{ status: 500 },
			);
		}

		const headers = new Headers();
		headers.set("Content-Type", "image/png");
		headers.set("Content-Length", screenshot.length.toString());
		headers.set("Cache-Control", "public, max-age=3600"); // Cache for 1 hour

		return new NextResponse(screenshot, { headers, status: 200 });
	} catch (error) {
		console.error("Fatal error:", error);
		return NextResponse.json(
			{ error: "Internal Server Error" },
			{ status: 500 },
		);
	} finally {
		if (browser) {
			await browser.close();
		}
	}
}
