import { getErrorMessage } from "@/utils/errorUtils";
import type { GetOrCreatePageReturnType } from "@/utils/puppeteer/page-utils";
import type { ProcessUrlReturnType } from "@/utils/puppeteer/url-processor";
import type { GetScreenshotOptions } from "@/app/try/route";

import { YOUTUBE_THUMBNAIL_URL } from "../constants";
import { captureScreenshot } from "../screenshot-helper";
import { getMetadata } from "./metadata";

interface GetScreenshotYouTubeOptions {
	logger: GetScreenshotOptions["logger"];
	page: GetOrCreatePageReturnType;
	url: ProcessUrlReturnType;
}

/**
 * Captures screenshot from YouTube thumbnail URLs
 * @param {GetScreenshotYouTubeOptions} options - Options containing page, url, and logger
 * @returns {Promise<null | { metaData: Awaited<ReturnType<typeof getMetadata>>; screenshot: Buffer }>} Screenshot buffer with metadata or null if not a YouTube thumbnail URL
 */
export async function getYouTubeScreenshot(
	options: GetScreenshotYouTubeOptions,
): Promise<null | {
	metaData: Awaited<ReturnType<typeof getMetadata>>;
	screenshot: Buffer;
}> {
	const { logger, page, url } = options;

	// Check if this is a YouTube thumbnail URL
	if (!url.includes(YOUTUBE_THUMBNAIL_URL)) {
		return null;
	}

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

			const metaData = await getMetadata({
				logger,
				page,
				url,
			});
			logger.info("YouTube thumbnail captured successfully");
			return { metaData, screenshot };
		}

		logger.info("No YouTube thumbnail found, falling back to page screenshot");
	} catch (error) {
		logger.warn(
			"YouTube thumbnail screenshot failed, falling back to page screenshot",
			{
				error: getErrorMessage(error),
			},
		);
	}

	// Return null to indicate fallback to page screenshot
	return null;
}
