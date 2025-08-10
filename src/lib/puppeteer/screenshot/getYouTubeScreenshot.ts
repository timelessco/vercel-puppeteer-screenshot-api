import type { GetOrCreatePageReturnType } from "@/lib/puppeteer/browser/pageUtils";
import type { ProcessUrlReturnType } from "@/lib/puppeteer/request/processUrl";
import { getErrorMessage } from "@/utils/errorUtils";
import type { GetScreenshotOptions } from "@/app/try/route";

import { YOUTUBE_THUMBNAIL_URL } from "../core/constants";
import { extractPageMetadata } from "../core/extractPageMetadata";
import { captureScreenshot } from "./captureScreenshot";

interface GetYouTubeScreenshotOptions {
	logger: GetScreenshotOptions["logger"];
	page: GetOrCreatePageReturnType;
	url: ProcessUrlReturnType;
}

/**
 * Captures screenshot from YouTube thumbnail URLs
 * @param {GetYouTubeScreenshotOptions} options - Options containing page, url, and logger
 * @returns {Promise<null | { metaData: Awaited<ReturnType<typeof extractPageMetadata>>; screenshot: Buffer }>} Screenshot buffer with metadata or null if not a YouTube thumbnail URL
 */
export async function getYouTubeScreenshot(
	options: GetYouTubeScreenshotOptions,
): Promise<null | {
	metaData: Awaited<ReturnType<typeof extractPageMetadata>>;
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

			const metaData = await extractPageMetadata({
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
