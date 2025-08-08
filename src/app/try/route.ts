import { NextResponse, type NextRequest } from "next/server";
import getVideoId from "get-video-id";
import type { Browser } from "rebrowser-puppeteer-core";

import { launchBrowser } from "@/utils/puppeteer/browser-launcher";
import { setupBrowserPage } from "@/utils/puppeteer/browser-setup";
import { cloudflareChecker } from "@/utils/puppeteer/cloudflareChecker";
import {
	buildErrorResponse,
	buildSuccessResponse,
} from "@/utils/puppeteer/core/response-builder";
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
		return buildErrorResponse(config.error, 400);
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

							logger.warn(
								"Video screenshot failed, falling back to regular screenshot",
							);

							// Fallback to page screenshot
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
							try {
								logger.info("Instagram URL detected");
								metaData = await getMetadata(page, urlStr, logger);
								const buffer = await getScreenshotInstagram(
									page,
									urlStr,
									imageIndex ?? undefined,
									logger,
								);

								if (buffer) {
									logger.info("Instagram screenshot captured successfully");
									return {
										metaData,
										screenshot: buffer,
									};
								}
								logger.warn(
									"Instagram screenshot buffer is null, falling back to page screenshot",
								);
							} catch (error) {
								logger.warn(
									"Instagram screenshot failed, falling back to page screenshot",
									{
										error:
											error instanceof Error ? error.message : String(error),
									},
								);

								// Fallback to page screenshot
							}
						}

						// X/Twitter special handling
						if (urlStr.includes(X) || urlStr.includes(TWITTER)) {
							try {
								logger.info("X/Twitter URL detected");
								const screenshotTarget = await getScreenshotX(
									page,
									urlStr,
									logger,
								);

								if (screenshotTarget && "screenshot" in screenshotTarget) {
									const screenshotTimer = logger.time(
										"X/Twitter element screenshot capture",
									);
									capturedScreenshot = await screenshotTarget.screenshot({
										optimizeForSpeed: true,
										type: "jpeg",
									});
									screenshotTimer();
									logger.info("X/Twitter screenshot captured successfully");
									return {
										metaData,
										screenshot: capturedScreenshot,
									};
								}
								logger.info(
									"No X/Twitter target element found, falling back to page screenshot",
								);
							} catch (error) {
								logger.warn(
									"X/Twitter screenshot failed, falling back to page screenshot",
									{
										error:
											error instanceof Error ? error.message : String(error),
									},
								);

								// Fallback to page screenshot
							}
						}

						// YouTube thumbnail special handling
						if (urlStr.includes(YOUTUBE_THUMBNAIL_URL)) {
							try {
								logger.info("YouTube: Looking for thumbnail image for video");
								const img = await page.$("img");

								if (img) {
									logger.info("YouTube: Thumbnail image found for video");
									const screenshotTimer = logger.time(
										"YouTube thumbnail screenshot capture",
									);
									capturedScreenshot = await img.screenshot({
										optimizeForSpeed: true,
										type: "jpeg",
									});
									screenshotTimer();
									logger.info("YouTube thumbnail captured successfully");
									return {
										metaData,
										screenshot: capturedScreenshot,
									};
								}
								logger.info(
									"No YouTube thumbnail found, falling back to page screenshot",
								);
							} catch (error) {
								logger.warn(
									"YouTube thumbnail screenshot failed, falling back to page screenshot",
									{
										error:
											error instanceof Error ? error.message : String(error),
									},
								);

								// Fallback to page screenshot
							}
						}

						// Default: regular page screenshot for all sites
						logger.info("Taking page screenshot");
						const screenshotTimer = logger.time("Page screenshot capture");
						capturedScreenshot = await page.screenshot({
							fullPage,
							optimizeForSpeed: true,
							type: "jpeg",
						});
						screenshotTimer();
						logger.info("Page screenshot captured successfully");

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
			return buildErrorResponse(error, 500);
		}

		logger.logSummary(true, screenshot.length);

		return buildSuccessResponse(screenshot, metaData);
	} catch (error) {
		logger.error("Fatal error", { error: (error as Error).message });
		logger.logSummary(false);
		return buildErrorResponse();
	} finally {
		if (browser) await closePageWithBrowser(browser, logger);
	}
}
