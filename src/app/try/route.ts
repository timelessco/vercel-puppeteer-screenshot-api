import fs from "node:fs";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import chromium from "@sparticuz/chromium-min";
import puppeteer, {
	type Browser,
	type ElementHandle,
	type JSHandle,
} from "rebrowser-puppeteer-core";

import cfCheck from "@/utils/puppeteer/cfCheck";
import {
	blockCookieBanners,
	getMetadata,
	getScreenshotInstagram,
	getScreenshotMp4,
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
	videoUrlRegex,
	X,
	YOUTUBE,
} from "@/utils/puppeteer/utils";

// https://nextjs.org/docs/app/api-reference/file-conventions/route#segment-config-options
export const maxDuration = 300;
// Disable caching for this route
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
	const url = new URL(request.url);
	let urlStr = url.searchParams.get("url");
	const fullPageParam = url.searchParams.get("fullpage");
	const fullPage = fullPageParam === "true";
	const url2 = urlStr ? new URL(urlStr) : null;
	const imageIndex =
		url2?.searchParams.get("img_index") ??
		url.searchParams.get("img_index") ??
		null;

	if (!urlStr) {
		return NextResponse.json(
			{ error: "Missing url parameter" },
			{ status: 400 },
		);
	}

	let browser: Browser | null = null;

	try {
		// eslint-disable-next-line import-x/no-named-as-default-member
		browser = await puppeteer.launch({
			args: isDev
				? [
						"--disable-blink-features=AutomationControlled",
						"--disable-features=site-per-process",
						"--disable-site-isolation-trials",
						"--disable-blink-features=AutomationControlled",
						"--disable-web-security",
						"--disable-features=VizDisplayCompositor",
						"--enable-features=NetworkService,NetworkServiceLogging",
						"--disable-background-timer-throttling",
						"--disable-backgrounding-occluded-windows",
						"--disable-renderer-backgrounding",
						"--disable-field-trial-config",
						"--disable-back-forward-cache",
						"--enable-unsafe-swiftshader", // For video rendering
						"--use-gl=swiftshader", // Software rendering for videos
						"--ignore-gpu-blacklist",
						"--disable-gpu-sandbox",
					]
				: [...chromium.args, "--disable-blink-features=AutomationControlled"],
			debuggingPort: isDev ? 9222 : undefined,
			executablePath: isDev
				? localExecutablePath
				: await chromium.executablePath(remoteExecutablePath),
			headless: !isDev,
			ignoreDefaultArgs: ["--enable-automation"],
		});

		const pages = await browser.pages();
		const page = pages[0];

		// here we check if the url is mp4 or not, by it's content type
		const contentType = await fetch(urlStr).then((res) =>
			res.headers.get("content-type"),
		);
		const isMp4 = contentType?.startsWith("video/") ?? false;
		// here we check if the url is mp4 or not, by using regex
		const isVideoUrl = videoUrlRegex.test(urlStr);

		//  since we render the urls in the video tag and take the screenshot, we dont need to worry about the bot detection
		// Replace this part in your main code:
		if (isMp4 || isVideoUrl) {
			try {
				const screenshot = await getScreenshotMp4(page, urlStr);

				if (screenshot) {
					const headers = new Headers();
					headers.set("Content-Type", "application/json");

					return new NextResponse(
						JSON.stringify({ metaData: null, screenshot }),
						{ headers, status: 200 },
					);
				} else {
					// Video screenshot failed, fall back to regular page handling
					console.warn(
						"Video screenshot failed, falling back to regular page screenshot",
					);
				}
			} catch (error) {
				console.error("Video screenshot error:", error);
			}
		}

		await page.setUserAgent(userAgent);

		await page.setViewport({ deviceScaleFactor: 2, height: 1200, width: 1440 });
		await page.emulateMediaFeatures([
			{ name: "prefers-color-scheme", value: "dark" },
		]);

		const preloadFile = fs.readFileSync(
			path.join(process.cwd(), "/src/utils/puppeteer/preload.js"),
			"utf8",
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

		let screenshot: Buffer | null | Uint8Array = null;
		let lastError: Error | null = null;
		let metaData: null | {
			description: null | string;
			favIcon: null | string;
			ogImage: null | string;
			title: null | string;
		} = null;

		for (let attempt = 1; attempt <= 2; attempt++) {
			try {
				console.log(`Navigation attempt ${attempt} to: ${urlStr}`);

				if (urlStr.includes(YOUTUBE)) {
					// here we use the getMetadata function to get the metadata of the video
					metaData = await getMetadata(page, urlStr);
					// Extract video ID from URL
					const videoIdMatch = /(?:v=|\/)([\w-]{11})/.exec(urlStr);
					const videoId = videoIdMatch?.[1];
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
							console.warn(
								"[role='dialog'] did not close after Escape — continuing anyway",
							);
						}
						console.log(`Taking screenshot attempt ${shotTry}`);
						let screenshotTarget:
							| ElementHandle<HTMLElement>
							| JSHandle<HTMLDivElement | null>
							| null = null;

						//instagram.com
						// in instagram we directly take screenshot in the function itself, because for reel we get the og:image
						// to maintain the  same we are returning the buffer
						//for other we select the html elemnt and take screenshot of it
						if (urlStr.includes(INSTAGRAM)) {
							// here we use the getMetadata function to get the metadata for the post and reel
							metaData = await getMetadata(page, urlStr);
							const buffer = await getScreenshotInstagram(
								page,
								urlStr,
								imageIndex ?? undefined,
							);
							const headers = new Headers();
							headers.set("Content-Type", "application/json");

							return new NextResponse(
								JSON.stringify({ metaData, screenshot: buffer }),
								{ headers, status: 200 },
							);
						}

						// X/Twitter: Get specific tweet element
						if (urlStr.includes(X) || urlStr.includes(TWITTER)) {
							screenshotTarget = await getScreenshotX(page, urlStr);
						}

						// YouTube: Get thumbnail image
						if (urlStr.includes(YOUTUBE)) {
							const img = await page.$("img");
							if (img) screenshotTarget = img;
						}

						await page
							.waitForFunction(
								() => {
									const challengeFrame = document.querySelector(
										'iframe[src*="challenge"]',
									);
									const title = document.title;
									return !challengeFrame && !title.includes("Just a moment");
								},
								{ timeout: 15_000 },
							)
							.catch(() => {
								console.warn("Cloudflare challenge may not have cleared");
							});

						// Detect if page has ONLY one video tag as the main content
						const videoElements = await page.$$eval(
							"video",
							(videos) => videos.length,
						);
						if (videoElements === 1) {
							const videoHandle = await page.$("video");
							if (videoHandle) {
								console.log(
									"Only one <video> tag found. Capturing that element.",
								);
								screenshot = await videoHandle.screenshot({ type: "jpeg" });
							}
						} else if (screenshotTarget) {
							await new Promise<void>((res) =>
								setTimeout(
									res,
									urlStr?.includes("stackoverflow") ? 10_000 : 1000,
								),
							);
							if ("screenshot" in screenshotTarget) {
								screenshot = await screenshotTarget.screenshot({
									// @ts-expect-error - deviceScaleFactor is not in the type
									deviceScaleFactor: 2,
									type: "jpeg",
								});
							}
						} else {
							await new Promise<void>((res) =>
								setTimeout(
									res,
									urlStr?.includes("stackoverflow") ? 10_000 : 1000,
								),
							);
							screenshot = await page.screenshot({ fullPage, type: "jpeg" });
						}

						console.log("Screenshot captured successfully.");
						break; // Exit loop on success
					} catch (error) {
						if (
							error instanceof Error &&
							error.message.includes("frame was detached")
						) {
							break;
						}
						lastError = error as Error;
					}
				}

				if (screenshot) break;
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("frame was detached")
				) {
					lastError = error;
				} else {
					throw error;
				}
			}
		}

		if (!screenshot) {
			return NextResponse.json(
				{ details: lastError?.message, error: "Failed to capture screenshot" },
				{ status: 500 },
			);
		}

		const headers = new Headers();
		headers.set("Content-Type", "application/json");

		return new NextResponse(JSON.stringify({ metaData, screenshot }), {
			headers,
			status: 200,
		});
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
