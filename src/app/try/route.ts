import { NextResponse, type NextRequest } from "next/server";
import getVideoId from "get-video-id";
import type { Browser } from "rebrowser-puppeteer-core";

import { getErrorMessage } from "@/utils/errorUtils";
import { launchBrowser } from "@/utils/puppeteer/browser-launcher";
import { setupBrowserPage } from "@/utils/puppeteer/browser-setup";
import { cloudflareChecker } from "@/utils/puppeteer/cloudflareChecker";
import { navigateWithFallback } from "@/utils/puppeteer/navigation";
import {
	closePageWithBrowser,
	getOrCreatePage,
	getPageMetrics,
} from "@/utils/puppeteer/page-utils";
import {
	parseRequestConfig,
	type RequestConfig,
} from "@/utils/puppeteer/request-parser";
import { retryWithBackoff } from "@/utils/puppeteer/retry-helpers";
import { captureScreenshot } from "@/utils/puppeteer/screenshot-helper";
import { getScreenshotInstagram } from "@/utils/puppeteer/site-handlers/instagram";
import { getMetadata } from "@/utils/puppeteer/site-handlers/metadata";
import { getScreenshotX } from "@/utils/puppeteer/site-handlers/twitter";
import { getScreenshotMp4 } from "@/utils/puppeteer/site-handlers/video";
import {
	INSTAGRAM,
	RESPONSE_HEADERS,
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
		return NextResponse.json(
			{ error: config.error },
			{ headers: new Headers(RESPONSE_HEADERS), status: 400 },
		);
	}

	const { logger } = config;

	try {
		const { metaData, screenshot } = await retryWithBackoff(
			() => getScreenshot(config),
			{ logger },
		);
		logger.logSummary(true, screenshot.length);

		return NextResponse.json(
			{ metaData, screenshot },
			{ headers: new Headers(RESPONSE_HEADERS), status: 200 },
		);
	} catch (error) {
		const errorMessage = getErrorMessage(error);
		logger.logSummary(false);

		return NextResponse.json(
			{ error: errorMessage },
			{ headers: new Headers(RESPONSE_HEADERS), status: 500 },
		);
	}
}

const getScreenshot = async (config: RequestConfig) => {
	const { fullPage, headless, imageIndex, logger, shouldGetPageMetrics, url } =
		config;
	let browser: Browser | null = null;

	try {
		let urlStr = url;

		logger.info("Starting screenshot capture", { fullPage, url });
		const { browser: browserInstance } = await launchBrowser({
			headless,
			logger,
		});
		browser = browserInstance;

		const page = await getOrCreatePage(browserInstance, logger);
		await setupBrowserPage(page, logger);

		// Check if URL is a video before page processing
		const urlResponse = await fetch(urlStr);
		const contentType = urlResponse.headers.get("content-type");
		const urlHasVideoContentType = contentType?.startsWith("video/") ?? false;
		const isVideoUrl = urlHasVideoContentType || videoUrlRegex.test(urlStr);
		if (isVideoUrl) {
			logger.info("Video URL detected", { contentType, isVideoUrl });
			const screenshot = await getScreenshotMp4(page, urlStr, logger);

			if (screenshot) {
				// No need to send metadata for video screenshot because we create that page
				return { metaData: null, screenshot };
			}

			logger.warn(
				"Video screenshot failed, falling back to regular screenshot",
			);

			// Fallback to page screenshot
		}

		// Check if the url is youtube and handle videoId
		// Change url to thumbnail url before navigating if videoId is found
		if (urlStr.includes(YOUTUBE)) {
			logger.info(
				"YouTube URL detected, fetching metadata and checking for videoId",
			);

			const { id: videoId } = getVideoId(urlStr);
			if (videoId) {
				logger.info(
					"Video ID found, changing YOUTUBE URL to YOUTUBE_THUMBNAIL_URL",
				);
				urlStr = `${YOUTUBE_THUMBNAIL_URL}/${videoId}/maxresdefault.jpg`;
			}
		}

		const response = await navigateWithFallback(page, { url: urlStr }, logger);

		if (shouldGetPageMetrics) await getPageMetrics(page, logger);

		if (!response?.ok()) {
			logger.warn("Navigation response not ok", {
				status: response?.status(),
				statusText: response?.statusText(),
			});
		}

		await cloudflareChecker(page, logger);

		// Handle dialogs if present
		try {
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
		} catch (error) {
			logger.debug("Skipping dialog check due to page state", {
				error,
			});
		}

		// Instagram special handling
		if (urlStr.includes(INSTAGRAM)) {
			try {
				logger.info("Instagram URL detected");
				const screenshot = await getScreenshotInstagram(
					page,
					urlStr,
					imageIndex ?? undefined,
					logger,
				);

				if (screenshot) {
					const metaData = await getMetadata(page, urlStr, logger);

					logger.info("Instagram screenshot captured successfully");
					return { metaData, screenshot };
				}
				logger.warn(
					"Instagram screenshot buffer is null, falling back to page screenshot",
				);
			} catch (error) {
				logger.warn(
					"Instagram screenshot failed, falling back to page screenshot",
					{
						error: getErrorMessage(error),
					},
				);

				// Fallback to page screenshot
			}
		}

		// X/Twitter special handling
		if (urlStr.includes(X) || urlStr.includes(TWITTER)) {
			try {
				logger.info("X/Twitter URL detected");
				const screenshotTarget = await getScreenshotX(page, urlStr, logger);

				if (screenshotTarget && "screenshot" in screenshotTarget) {
					const screenshot = await captureScreenshot(
						screenshotTarget,
						{ optimizeForSpeed: true, type: "jpeg" },
						logger,
						"X/Twitter element screenshot capture",
					);
					const metaData = await getMetadata(page, urlStr, logger);

					logger.info("X/Twitter screenshot captured successfully");
					return { metaData, screenshot };
				}
				logger.info(
					"No X/Twitter target element found, falling back to page screenshot",
				);
			} catch (error) {
				logger.warn(
					"X/Twitter screenshot failed, falling back to page screenshot",
					{
						error: getErrorMessage(error),
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
					const screenshot = await captureScreenshot(
						img,
						{ optimizeForSpeed: true, type: "jpeg" },
						logger,
						"YouTube thumbnail screenshot capture",
					);

					const metaData = await getMetadata(page, urlStr, logger);
					logger.info("YouTube thumbnail captured successfully");
					return { metaData, screenshot };
				}

				logger.info(
					"No YouTube thumbnail found, falling back to page screenshot",
				);
			} catch (error) {
				logger.warn(
					"YouTube thumbnail screenshot failed, falling back to page screenshot",
					{
						error: getErrorMessage(error),
					},
				);

				// Fallback to page screenshot
			}
		}

		// Default: regular page screenshot for all sites
		logger.info("Taking page screenshot");
		const screenshot = await captureScreenshot(
			page,
			{ fullPage, optimizeForSpeed: true, type: "jpeg" },
			logger,
			"Page screenshot capture",
		);

		const metaData = await getMetadata(page, urlStr, logger);
		logger.info("Page screenshot captured successfully");
		return { metaData, screenshot };
	} catch (error) {
		logger.error("Fatal error in browser/page creation", {
			error: getErrorMessage(error),
		});

		// Get page metrics in error scenario for debugging
		if (shouldGetPageMetrics && browser) {
			try {
				// Browser is guaranteed to exist here since we're inside the try block after browser creation
				const pages = await browser.pages();
				if (pages.length > 0) {
					await getPageMetrics(pages[0], logger);
				}
			} catch {
				// Ignore monitoring errors
			}
		}

		throw error;
	} finally {
		if (browser) await closePageWithBrowser(browser, logger);
	}
};
