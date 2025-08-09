import { NextResponse, type NextRequest } from "next/server";
import type { Browser } from "rebrowser-puppeteer-core";

import { getErrorMessage } from "@/utils/errorUtils";
import { launchBrowser } from "@/utils/puppeteer/browser-launcher";
import { setupBrowserPage } from "@/utils/puppeteer/browser-setup";
import { cloudflareChecker } from "@/utils/puppeteer/cloudflareChecker";
import {
	INSTAGRAM,
	RESPONSE_HEADERS,
	TWITTER,
	X,
	YOUTUBE_THUMBNAIL_URL,
} from "@/utils/puppeteer/constants";
import { handleDialogs } from "@/utils/puppeteer/dialog-handler";
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
import { processUrl } from "@/utils/puppeteer/url-processor";
import { handleVideoUrl } from "@/utils/puppeteer/video-handler";

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
		const processedUrl = processUrl(url, logger);

		logger.info("Starting screenshot capture", { fullPage, url });
		const { browser: browserInstance } = await launchBrowser({
			headless,
			logger,
		});
		browser = browserInstance;

		const page = await getOrCreatePage(browserInstance, logger);
		await setupBrowserPage(page, logger);

		// Check if URL is a video and handle it
		const videoResult = await handleVideoUrl(page, processedUrl, logger);
		if (videoResult) {
			return videoResult;
		}

		const response = await navigateWithFallback(
			page,
			{ url: processedUrl },
			logger,
		);
		if (!response?.ok()) {
			logger.warn("Navigation response not ok", {
				status: response?.status(),
				statusText: response?.statusText(),
			});
		}
		if (shouldGetPageMetrics) await getPageMetrics(page, logger);
		await cloudflareChecker(page, logger);
		await handleDialogs(page, logger);

		// Instagram special handling
		if (processedUrl.includes(INSTAGRAM)) {
			try {
				logger.info("Instagram URL detected");
				const screenshot = await getScreenshotInstagram(
					page,
					processedUrl,
					imageIndex ?? undefined,
					logger,
				);

				if (screenshot) {
					const metaData = await getMetadata(page, processedUrl, logger);

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
		if (processedUrl.includes(X) || processedUrl.includes(TWITTER)) {
			try {
				logger.info("X/Twitter URL detected");
				const screenshotTarget = await getScreenshotX(
					page,
					processedUrl,
					logger,
				);

				if (screenshotTarget && "screenshot" in screenshotTarget) {
					const screenshot = await captureScreenshot({
						logger,
						target: screenshotTarget,
						timerLabel: "X/Twitter element screenshot capture",
					});
					const metaData = await getMetadata(page, processedUrl, logger);

					logger.info("X/Twitter screenshot captured successfully");
					return { metaData, screenshot };
				}
				logger.info(
					"No X/Twitter target element found, falling back to page screenshot",
				);
			} catch (error) {
				logger.warn(
					"X/Twitter screenshot failed, falling back to page screenshot",
					{ error: getErrorMessage(error) },
				);

				// Fallback to page screenshot
			}
		}

		// YouTube thumbnail special handling
		if (processedUrl.includes(YOUTUBE_THUMBNAIL_URL)) {
			try {
				logger.info("YouTube: Looking for thumbnail image for video");
				const img = await page.$("img");

				if (img) {
					logger.info("YouTube: Thumbnail image found for video");
					const screenshot = await captureScreenshot({
						logger,
						target: img,
						timerLabel: "YouTube thumbnail screenshot capture",
					});

					const metaData = await getMetadata(page, processedUrl, logger);
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
		const screenshot = await captureScreenshot({
			logger,
			target: page,
			timerLabel: "Page screenshot capture",
		});

		const metaData = await getMetadata(page, processedUrl, logger);
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
