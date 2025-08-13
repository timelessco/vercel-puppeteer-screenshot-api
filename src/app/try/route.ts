import { NextResponse, type NextRequest } from "next/server";

import {
	launchBrowser,
	type LaunchBrowserReturnType,
} from "@/lib/puppeteer/browser/launchBrowser";
import { closePageWithBrowser } from "@/lib/puppeteer/browser/pageUtils";
import {
	INSTAGRAM,
	RESPONSE_HEADERS,
	TWITTER,
	X,
} from "@/lib/puppeteer/core/constants";
import type { GetMetadataReturnType } from "@/lib/puppeteer/core/extractPageMetadata";
import {
	isImageUrl,
	isImageUrlByExtension,
} from "@/lib/puppeteer/core/isImageUrl";
import {
	isVideoUrl,
	isVideoUrlByExtension,
} from "@/lib/puppeteer/core/isVideoUrl";
import { retryWithBackoff } from "@/lib/puppeteer/core/retryWithBackoff";
import {
	parseRequestConfig,
	type RequestConfig,
} from "@/lib/puppeteer/request/parseRequestConfig";
import { processUrl } from "@/lib/puppeteer/request/processUrl";
import { getImageScreenshot } from "@/lib/puppeteer/screenshot/getImageScreenshot";
import { getInstagramPostReelScreenshot } from "@/lib/puppeteer/screenshot/getInstagramPostReelScreenshot";
import { getPageScreenshot } from "@/lib/puppeteer/screenshot/getPageScreenshot";
import { getTwitterScreenshot } from "@/lib/puppeteer/screenshot/getTwitterScreenshot";
import { getVideoScreenshot } from "@/lib/puppeteer/screenshot/getVideoScreenshot";
import { getErrorMessage } from "@/utils/errorUtils";

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

		// Instagram check
		if (
			processedUrl.includes(INSTAGRAM) &&
			(processedUrl.includes("/p/") || processedUrl.includes("/reel/"))
		) {
			const instagramResult = await getInstagramPostReelScreenshot({
				browser: browserInstance,
				logger,
				shouldGetPageMetrics,
				url: processedUrl,
			});
			if (instagramResult) return instagramResult;
		}

		// Twitter/X check
		if (processedUrl.includes(X) || processedUrl.includes(TWITTER)) {
			const twitterResult = await getTwitterScreenshot({
				browser: browserInstance,
				logger,
				shouldGetPageMetrics,
				url: processedUrl,
			});
			if (twitterResult) return twitterResult;
		}

		// Image check - Two phase approach
		// Phase 1: Quick extension check
		if (isImageUrlByExtension(processedUrl)) {
			logger.info("Image detected by extension, processing image screenshot");
			const imageResult = await getImageScreenshot({
				browser: browserInstance,
				logger,
				url: processedUrl,
			});
			if (imageResult) return imageResult;
		}

		// Video check - Two phase approach
		// Phase 1: Quick extension check
		if (isVideoUrlByExtension(processedUrl)) {
			logger.info("Video detected by extension, processing video screenshot");
			const videoResult = await getVideoScreenshot({
				browser: browserInstance,
				logger,
				url: processedUrl,
			});
			if (videoResult) return videoResult;
		}

		// Phase 2: For ambiguous URLs, check content-type for images
		const mightBeImage = await isImageUrl(processedUrl, true);
		if (mightBeImage) {
			logger.info(
				"Image detected by content-type, processing image screenshot",
			);
			const imageResult = await getImageScreenshot({
				browser: browserInstance,
				logger,
				url: processedUrl,
			});
			if (imageResult) return imageResult;
		}

		// Phase 2: For ambiguous URLs, check content-type for videos
		const mightBeVideo = await isVideoUrl(processedUrl, true);
		if (mightBeVideo) {
			logger.info(
				"Video detected by content-type, processing video screenshot",
			);
			const videoResult = await getVideoScreenshot({
				browser: browserInstance,
				logger,
				url: processedUrl,
			});
			if (videoResult) return videoResult;
		}

		// Page screenshot for all other URLs
		const pageScreenshot = await getPageScreenshot({
			browser: browserInstance,
			fullPage,
			logger,
			shouldGetPageMetrics,
			url: processedUrl,
		});
		return pageScreenshot;
	} catch (error) {
		logger.error("Fatal error in browser/page creation", {
			error: getErrorMessage(error),
		});

		throw error;
	} finally {
		if (browser) await closePageWithBrowser({ browser, logger });
	}
}
