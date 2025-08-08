import { NextResponse, type NextRequest } from "next/server";
import getVideoId from "get-video-id";
import type {
	Browser,
	ElementHandle,
	JSHandle,
} from "rebrowser-puppeteer-core";

import { launchBrowser } from "@/utils/puppeteer/browser-launcher";
import { setupBrowserPage } from "@/utils/puppeteer/browser-setup";
import { cloudflareChecker } from "@/utils/puppeteer/cloudflareChecker";
import { navigateWithFallback } from "@/utils/puppeteer/navigation";
import {
	closePageSafely,
	closePageWithBrowser,
	getOrCreatePage,
} from "@/utils/puppeteer/page-utils";
import { parseRequestConfig } from "@/utils/puppeteer/request-parser";
import { retryWithBackoff } from "@/utils/puppeteer/retry-helpers";
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
	YOUTUBE_THUMBNAIL_URL,
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
		logger.info("Starting screenshot capture", { fullPage, url });

		const { browser: browserInstance } = await launchBrowser({
			headless,
			logger,
		});
		browser = browserInstance;

		// Check if URL is a video before page processing
		const response = await fetch(urlStr);
		const contentType = response.headers.get("content-type");
		const urlHasVideoContentType = contentType?.startsWith("video/") ?? false;
		const isVideoUrl = urlHasVideoContentType || videoUrlRegex.test(urlStr);

		let screenshot: Buffer | null | Uint8Array = null;
		let metaData: null | {
			description: null | string;
			favIcon: null | string;
			ogImage: null | string;
			title: null | string;
		} = null;

		try {
			const result = await retryWithBackoff(
				async () => {
					// Fresh page for each attempt
					const page = await getOrCreatePage(browserInstance, logger);

					try {
						logger.info("Starting navigation and screenshot attempt", {
							url: urlStr,
						});

						await setupBrowserPage(page, logger);

						if (isVideoUrl) {
							logger.info("Video URL detected", { contentType, isVideoUrl });
							const videoScreenshot = await getScreenshotMp4(
								page,
								urlStr,
								logger,
							);

							if (videoScreenshot) {
								return { metaData: null, screenshot: videoScreenshot };
							}

							// If video screenshot fails, continue to regular screenshot
							logger.warn(
								"Video screenshot failed, falling back to regular screenshot",
							);
						}

						// Check if the url is youtube and handle videoId
						if (urlStr.includes(YOUTUBE)) {
							logger.info(
								"YouTube URL detected, fetching metadata and checking for videoId",
							);

							metaData = await getMetadata(page, urlStr, logger);

							const { id: videoId } = getVideoId(urlStr);
							if (videoId) {
								logger.info(
									"Video ID found, changing YOUTUBE URL to YOUTUBE_THUMBNAIL_URL",
								);
								urlStr = `${YOUTUBE_THUMBNAIL_URL}/${videoId}/maxresdefault.jpg`;
							}
						}

						const response = await navigateWithFallback(
							page,
							{ url: urlStr },
							logger,
						);

						if (!response?.ok()) {
							logger.warn("Navigation response not ok", {
								status: response?.status(),
								statusText: response?.statusText(),
							});
						}

						await cloudflareChecker(page, logger);

						// Handle dialogs if present
						const dialogElement = await page.$('div[role="dialog"]');
						if (dialogElement) {
							logger.info("Dialog detected, attempting to close");
							await page.keyboard.press("Escape");

							try {
								await page.waitForSelector('div[role="dialog"]', {
									hidden: true,
									timeout: 2000,
								});
								logger.info("Dialog closed");
							} catch {
								logger.warn(
									"[role='dialog'] did not close after Escape — continuing anyway",
								);
							}
						} else {
							logger.debug("No dialog detected, skipping dialog handling");
						}

						logger.info("Taking screenshot");
						let capturedScreenshot: Buffer | Uint8Array;

						// Instagram special handling
						if (urlStr.includes(INSTAGRAM)) {
							logger.info("Instagram URL detected");
							metaData = await getMetadata(page, urlStr, logger);
							const buffer = await getScreenshotInstagram(
								page,
								urlStr,
								imageIndex ?? undefined,
								logger,
							);

							if (!buffer) {
								throw new Error("Failed to capture Instagram screenshot");
							}

							capturedScreenshot = buffer;
						} else {
							// Handle other URL types with potential specific screenshot targets
							let screenshotTarget:
								| ElementHandle<HTMLElement>
								| JSHandle<HTMLDivElement | null>
								| null = null;

							// X/Twitter: Get specific tweet element
							if (urlStr.includes(X) || urlStr.includes(TWITTER)) {
								logger.info("X/Twitter URL detected");
								screenshotTarget = await getScreenshotX(page, urlStr, logger);
							}

							// YouTube: Get thumbnail image only if it is an video else take entire page screenshot
							if (urlStr.includes(YOUTUBE_THUMBNAIL_URL)) {
								logger.info("YouTube: Looking for thumbnail image for video");
								const img = await page.$("img");
								if (img) {
									logger.info("YouTube: Thumbnail image found for video");
									screenshotTarget = img;
								}
							}

							// Take screenshot based on target
							if (screenshotTarget && "screenshot" in screenshotTarget) {
								const screenshotTimer = logger.time(
									"Element screenshot capture",
								);
								capturedScreenshot = await screenshotTarget.screenshot({
									optimizeForSpeed: true,
									type: "jpeg",
								});
								screenshotTimer();
							} else {
								logger.info(
									"No screenshot target found, taking page screenshot",
								);
								const screenshotTimer = logger.time("Page screenshot capture");
								capturedScreenshot = await page.screenshot({
									fullPage,
									optimizeForSpeed: true,
									type: "jpeg",
								});
								screenshotTimer();
							}
						}

						logger.info("Screenshot captured successfully");
						return {
							metaData,
							screenshot: capturedScreenshot,
						};
					} finally {
						await closePageSafely(page, logger);
					}
				},
				{
					baseDelay: 1000,
					logger,
					maxRetries: 1,
				},
			);

			screenshot = result.screenshot;
			metaData = result.metaData;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error("Failed to capture screenshot after retries", {
				details: errorMessage,
			});
			return NextResponse.json(
				{
					details: errorMessage,
					error: "Failed to capture screenshot",
				},
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
		if (browser) await closePageWithBrowser(browser, logger);
	}
}
