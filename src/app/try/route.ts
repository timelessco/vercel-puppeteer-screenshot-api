import { NextResponse, type NextRequest } from "next/server";

import { getErrorMessage } from "@/utils/errorUtils";
import {
	launchBrowser,
	type LaunchBrowserReturnType,
} from "@/utils/puppeteer/browser-launcher";
import { setupBrowserPage } from "@/utils/puppeteer/browser-setup";
import { cloudflareChecker } from "@/utils/puppeteer/cloudflareChecker";
import { RESPONSE_HEADERS } from "@/utils/puppeteer/constants";
import { handleDialogs } from "@/utils/puppeteer/dialog-handler";
import { gotoPage } from "@/utils/puppeteer/navigation";
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
import { getInstagramScreenshot } from "@/utils/puppeteer/site-handlers/instagram";
import {
	getMetadata,
	type GetMetadataReturnType,
} from "@/utils/puppeteer/site-handlers/metadata";
import { getTwitterScreenshot } from "@/utils/puppeteer/site-handlers/twitter";
import { getVideoScreenshot } from "@/utils/puppeteer/site-handlers/video";
import { getYouTubeScreenshot } from "@/utils/puppeteer/site-handlers/youtube";
import { processUrl } from "@/utils/puppeteer/url-processor";

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
		const { metaData, screenshot } = await retryWithBackoff({
			callback: () => getScreenshot(config),
			options: { logger },
		});
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

export type GetScreenshotOptions = RequestConfig;

async function getScreenshot(config: GetScreenshotOptions): Promise<{
	metaData: GetMetadataReturnType;
	screenshot: Buffer;
}> {
	const { fullPage, headless, logger, shouldGetPageMetrics, url } = config;
	let browser: LaunchBrowserReturnType | null = null;

	try {
		logger.info("Starting screenshot capture", { fullPage, url });

		// Process URLs like Youtube Video to get the image directly from img.youtube.com
		const processedUrl = processUrl({ logger, url });
		logger.info("Processed url for screenshot capture", { processedUrl });

		const browserInstance = await launchBrowser({ headless, logger });
		browser = browserInstance;

		const page = await getOrCreatePage({ browser: browserInstance, logger });

		// Use mobile emulation for Instagram URLs
		await setupBrowserPage({
			logger,
			page,
		});

		// Check if URL is a video and handle it separately before navigating
		const videoResult = await getVideoScreenshot({
			logger,
			page,
			url: processedUrl,
		});
		if (videoResult) return videoResult; // Fallback to page screenshot

		await gotoPage({
			logger,
			page,
			url: processedUrl,
		});

		if (shouldGetPageMetrics) await getPageMetrics({ logger, page });
		await cloudflareChecker({ logger, page });
		await handleDialogs({ logger, page });

		const instagramResult = await getInstagramScreenshot({
			logger,
			page,
			url: processedUrl,
		});
		if (instagramResult) return instagramResult;

		// X/Twitter special handling
		const twitterResult = await getTwitterScreenshot({
			logger,
			page,
			url: processedUrl,
		});
		if (twitterResult) return twitterResult;

		// YouTube thumbnail special handling
		const youtubeResult = await getYouTubeScreenshot({
			logger,
			page,
			url: processedUrl,
		});
		if (youtubeResult) return youtubeResult;

		// Default: regular page screenshot for all sites
		logger.info("Taking page screenshot");
		const screenshot = await captureScreenshot({
			logger,
			target: page,
			timerLabel: "Page screenshot capture",
		});

		const metaData = await getMetadata({ logger, page, url: processedUrl });
		logger.info("Page screenshot captured successfully with metadata");
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
					await getPageMetrics({ logger, page: pages[0] });
				}
			} catch {
				// Ignore monitoring errors
			}
		}

		throw error;
	} finally {
		if (browser) await closePageWithBrowser({ browser, logger });
	}
}
