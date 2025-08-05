import fs from "node:fs";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import type {
	Browser,
	ElementHandle,
	JSHandle,
	LaunchOptions,
} from "rebrowser-puppeteer-core";

import { cfCheck } from "@/utils/puppeteer/cfCheck";
import {
	blockCookieBanners,
	manualCookieBannerRemoval,
} from "@/utils/puppeteer/helpers";
import { parseRequestConfig } from "@/utils/puppeteer/request-parser";
import { getScreenshotInstagram } from "@/utils/puppeteer/site-handlers/instagram";
import { getMetadata } from "@/utils/puppeteer/site-handlers/metadata";
import { getScreenshotX } from "@/utils/puppeteer/site-handlers/twitter";
import { getScreenshotMp4 } from "@/utils/puppeteer/site-handlers/video";
import {
	INSTAGRAM,
	TWITTER,
	videoUrlRegex,
	X,
	YOUTUBE,
} from "@/utils/puppeteer/utils";

// https://nextjs.org/docs/app/api-reference/file-conventions/route#segment-config-options
export const maxDuration = 300;
// Disable caching for this route - https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
	const config = parseRequestConfig(request);

	if ("error" in config) {
		return NextResponse.json({ error: config.error }, { status: 400 });
	}

	const { fullPage, headless, imageIndex, logger, url } = config;
	let urlStr = url;

	let browser: Browser | null = null;

	try {
		// https://vercel.com/docs/environment-variables/system-environment-variables#VERCEL_ENV
		const isVercel = !!process.env.VERCEL_ENV;
		logger.info("Starting screenshot capture", {
			environment: isVercel ? "Vercel" : "Local",
			fullPage,
			url,
		});

		let puppeteer: typeof import("rebrowser-puppeteer-core");
		let launchOptions: LaunchOptions = {
			args: [
				// Autoset in headless environment but needed for development
				"--enable-automation",
				// X.com doesn't work without this
				"--disable-field-trial-config",
				// Disable certain features to avoid detection
				"--disable-blink-features=AutomationControlled",
			],
			headless,
		};

		if (isVercel) {
			const chromiumModule = (await import(
				"@sparticuz/chromium"
			)) as unknown as typeof import("@sparticuz/chromium");
			const chromium = chromiumModule.default;

			puppeteer = await import("rebrowser-puppeteer-core");
			launchOptions = {
				...launchOptions,
				args: [...chromium.args, ...(launchOptions.args ?? [])],
				executablePath: await chromium.executablePath(),
			};
		} else {
			// @ts-expect-error - Type incompatibility between puppeteer and puppeteer-core
			puppeteer = await import("rebrowser-puppeteer");
		}

		const launchTimer = logger.time("Browser launch");
		browser = await puppeteer.launch(launchOptions);
		launchTimer();
		logger.info("Browser launched successfully");

		// Using a pre-loaded page reduces startup time by avoiding new page creation unless necessary.
		const pages = await browser.pages();
		const page = pages[0] || (await browser.newPage());

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
				logger.debug("Page JS error", { error: err.message });
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
			const method = req.method();

			if (blocked.some((str) => requestUrl.includes(str))) {
				logger.logNetworkRequest(requestUrl, method, undefined, true);

				void req.abort();
			} else {
				void req.continue();
			}
		});

		// Initialize cookie banner blocking
		await blockCookieBanners(page, logger);

		// here we check if the url is mp4 or not, by it's content type
		const response = await fetch(urlStr);
		const contentType = response.headers.get("content-type");
		const isMp4 = contentType?.startsWith("video/") ?? false;
		// here we check if the url is mp4 or not, by using regex
		const isVideoUrl = videoUrlRegex.test(urlStr);
		if (isMp4 || isVideoUrl) {
			logger.info("Video URL detected", { contentType, isVideoUrl });
		}

		//  since we render the urls in the video tag and take the screenshot, we dont need to worry about the bot detection
		// Replace this part in your main code:
		if (isMp4 || isVideoUrl) {
			try {
				const screenshot = await getScreenshotMp4(page, urlStr, logger);

				if (screenshot) {
					const headers = new Headers();
					headers.set("Content-Type", "application/json");

					return new NextResponse(
						JSON.stringify({ metaData: null, screenshot }),
						{ headers, status: 200 },
					);
				} else {
					// Video screenshot failed, fall back to regular page handling
					logger.warn(
						"Video screenshot failed, falling back to regular page screenshot",
					);
				}
			} catch (error) {
				logger.warn("Video screenshot error", {
					error: (error as Error).message,
				});
			}
		}

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
				logger.info(`Navigation attempt ${attempt}`, { url: urlStr });

				if (urlStr.includes(YOUTUBE)) {
					logger.info("YouTube URL detected, fetching metadata");

					// here we use the getMetadata function to get the metadata of the video
					metaData = await getMetadata(page, urlStr, logger);
					// Extract video ID from URL
					const videoIdMatch = /(?:v=|\/)([\w-]{11})/.exec(urlStr);
					const videoId = videoIdMatch?.[1];
					if (videoId) {
						// Create  URL
						urlStr = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
					}
				}

				const navTimer = logger.time("Page navigation");
				const response = await page.goto(urlStr, {
					timeout: 300_000,
					waitUntil: "networkidle2",
				});
				navTimer();

				if (!response?.ok()) {
					logger.warn(`Navigation attempt ${attempt} failed`, {
						status: response?.status(),
						statusText: response?.statusText(),
					});
				}

				// Wait for fonts to load
				logger.info("Waiting for fonts to load");
				await page.evaluate(() => document.fonts.ready);

				// Run Cloudflare check
				logger.info("Running Cloudflare check");
				await cfCheck(page, logger);

				// Manual cookie banner removal as fallback
				await manualCookieBannerRemoval(page, logger);

				for (let shotTry = 1; shotTry <= 2; shotTry++) {
					try {
						await page.keyboard.press("Escape");
						try {
							await page.waitForSelector('div[role="dialog"]', {
								hidden: true,
								timeout: 2000,
							});
						} catch {
							logger.warn(
								"[role='dialog'] did not close after Escape — continuing anyway",
							);
						}

						logger.info(`Taking screenshot attempt ${shotTry}`);
						let screenshotTarget:
							| ElementHandle<HTMLElement>
							| JSHandle<HTMLDivElement | null>
							| null = null;

						//instagram.com
						// in instagram we directly take screenshot in the function itself, because for reel we get the og:image
						// to maintain the  same we are returning the buffer
						//for other we select the html elemnt and take screenshot of it
						if (urlStr.includes(INSTAGRAM)) {
							logger.info("Instagram URL detected");

							// here we use the getMetadata function to get the metadata for the post and reel
							metaData = await getMetadata(page, urlStr, logger);
							const buffer = await getScreenshotInstagram(
								page,
								urlStr,
								imageIndex ?? undefined,
								logger,
							);

							if (buffer) {
								const headers = new Headers();
								headers.set("Content-Type", "application/json");

								return new NextResponse(
									JSON.stringify({ metaData, screenshot: buffer }),
									{ headers, status: 200 },
								);
							}
						}

						// X/Twitter: Get specific tweet element
						if (urlStr.includes(X) || urlStr.includes(TWITTER)) {
							logger.info("X/Twitter URL detected");

							screenshotTarget = await getScreenshotX(page, urlStr, logger);
						}

						// YouTube: Get thumbnail image
						if (urlStr.includes(YOUTUBE)) {
							logger.info("YouTube: Looking for thumbnail image");

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
								logger.warn("Cloudflare challenge may not have cleared");
							});

						// Detect if page has ONLY one video tag as the main content
						const videoElements = await page.$$eval(
							"video",
							(videos) => videos.length,
						);
						if (videoElements === 1 && (isMp4 || isVideoUrl)) {
							const videoHandle = await page.$("video");
							if (videoHandle) {
								logger.info(
									"Only one <video> tag found. Capturing that element.",
								);

								screenshot = await videoHandle.screenshot({ type: "jpeg" });
							}
						} else if (screenshotTarget) {
							await new Promise<void>((res) =>
								setTimeout(
									res,
									urlStr.includes("stackoverflow") ? 10_000 : 1000,
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
									urlStr.includes("stackoverflow") ? 10_000 : 1000,
								),
							);
							screenshot = await page.screenshot({ fullPage, type: "jpeg" });
						}

						logger.info(
							`Screenshot captured successfully in ${shotTry} attempt`,
						);

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
			logger.error("Failed to capture screenshot", {
				details: lastError?.message,
			});
			return NextResponse.json(
				{ details: lastError?.message, error: "Failed to capture screenshot" },
				{ status: 500 },
			);
		}

		logger.logSummary(true, screenshot.length);

		const headers = new Headers();
		headers.set("Content-Type", "application/json");

		return new NextResponse(JSON.stringify({ metaData, screenshot }), {
			headers,
			status: 200,
		});
	} catch (error) {
		logger.error("Fatal error", { error: (error as Error).message });
		logger.logSummary(false);
		return NextResponse.json(
			{ error: "Internal Server Error" },
			{ status: 500 },
		);
	} finally {
		if (browser) {
			logger.info("Closing browser");
			await browser.close();
		}
	}
}
