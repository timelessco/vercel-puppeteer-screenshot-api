import { NextResponse, type NextRequest } from "next/server";

import {
	INSTAGRAM,
	RESPONSE_HEADERS,
	TWITTER,
	X,
} from "@/lib/puppeteer/core/constants";
import type { GetMetadataReturnType } from "@/lib/puppeteer/core/getMetadata";
import {
	isImageUrl,
	isImageUrlByExtension,
} from "@/lib/puppeteer/core/isImageUrl";
import {
	isVideoUrl,
	isVideoUrlByExtension,
} from "@/lib/puppeteer/core/isVideoUrl";
import { retryWithBackoff } from "@/lib/puppeteer/core/retryWithBackoff";
import { withBrowser } from "@/lib/puppeteer/core/withBrowser";
import {
	parseRequestConfig,
	type RequestConfig,
} from "@/lib/puppeteer/request/parseRequestConfig";
import { processUrl } from "@/lib/puppeteer/request/processUrl";
import {
	fetchImageDirectly,
	getImageScreenshot,
} from "@/lib/puppeteer/screenshot/getImageScreenshot";
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
		const { allImages, allVideos, metaData, screenshot } =
			await retryWithBackoff({
				callback: () => getScreenshot(config),
				options: { logger },
			});

		logger.info("all videos", { allVideos });
		logger.info("all images", { allImages });

		logger.logSummary(true, screenshot.length, metaData ?? undefined);
		return NextResponse.json(
			{ allImages, allVideos, metaData, screenshot },
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

/**
 * Standard screenshot result returned by all screenshot handlers
 * allImages contains carousel images for Instagram, empty array for other handlers
 * allVideos contains video URLs for Twitter, empty array for other handlers
 */
export interface ScreenshotResult {
	allImages: Buffer[];
	allVideos: string[];
	metaData: GetMetadataReturnType;
	screenshot: Buffer;
}

async function getScreenshot(
	config: GetScreenshotOptions,
): Promise<ScreenshotResult> {
	const { fullPage, logger, url } = config;

	try {
		logger.info("Starting screenshot capture", { fullPage, url });

		// Process URLs like Youtube Video to get the image directly from img.youtube.com
		const processedUrl = processUrl({ logger, url });
		logger.info("Processed url for screenshot capture", { processedUrl });

		const newConfig = { ...config, url: processedUrl };

		// Try direct image fetch BEFORE launching browser
		// Phase 1: Quick extension check
		if (isImageUrlByExtension(processedUrl)) {
			logger.info("Image detected by extension, trying direct fetch first");
			try {
				const buffer = await fetchImageDirectly(newConfig);
				logger.info("Successfully fetched image directly without browser");
				return {
					allImages: [],
					allVideos: [],
					metaData: null,
					screenshot: buffer,
				};
			} catch (error) {
				logger.info("Retrying image with Puppeteer after direct fetch failed", {
					error,
				});
				return await withBrowser(
					newConfig,
					getImageScreenshot,
					getPageScreenshot,
				);
			}
		}

		// Phase 2: For ambiguous URLs, check content-type for images
		const mightBeImage = await isImageUrl(processedUrl, true);
		if (mightBeImage) {
			logger.info("Image detected by content-type, trying direct fetch first");
			try {
				const buffer = await fetchImageDirectly(newConfig);
				logger.info("Successfully fetched ambiguous image directly");
				return {
					allImages: [],
					allVideos: [],
					metaData: null,
					screenshot: buffer,
				};
			} catch (error) {
				logger.info("Retrying image with Puppeteer after direct fetch failed", {
					error,
				});
				return await withBrowser(
					newConfig,
					getImageScreenshot,
					getPageScreenshot,
				);
			}
		}

		// Video check - Two phase approach
		// Phase 1: Quick extension check
		if (isVideoUrlByExtension(processedUrl)) {
			logger.info("Video detected by extension, processing video screenshot");
			return await withBrowser(
				newConfig,
				getVideoScreenshot,
				getPageScreenshot,
			);
		}

		// Phase 2: For ambiguous URLs, check content-type for videos
		const mightBeVideo = await isVideoUrl(processedUrl, true);
		if (mightBeVideo) {
			logger.info(
				"Video detected by content-type, processing video screenshot",
			);
			return await withBrowser(
				newConfig,
				getVideoScreenshot,
				getPageScreenshot,
			);
		}

		// Instagram check - returns allImages from handler
		if (
			processedUrl.includes(INSTAGRAM) &&
			(processedUrl.includes("/p/") || processedUrl.includes("/reel/"))
		) {
			return await withBrowser(
				newConfig,
				getInstagramPostReelScreenshot,
				getPageScreenshot,
			);
		}

		// Twitter/X check
		if (processedUrl.includes(X) || processedUrl.includes(TWITTER)) {
			return await withBrowser(
				newConfig,
				getTwitterScreenshot,
				getPageScreenshot,
			);
		}

		// Page screenshot for all other URLs - always returns something
		return await withBrowser(newConfig, getPageScreenshot);
	} catch (error) {
		logger.error("Error in getScreenshot", { error: getErrorMessage(error) });
		throw error;
	}
}
