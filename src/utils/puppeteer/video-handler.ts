import type { Page } from "rebrowser-puppeteer-core";

import { videoUrlRegex } from "./constants";
import type { Logger } from "./logger";
import { getScreenshotMp4 } from "./site-handlers/video";

/**
 * Handle video URL detection and screenshot capture
 * @param {Page} page - The Puppeteer page instance
 * @param {string} url - The URL to check and process
 * @param {Logger} logger - Logger instance for debugging
 * @returns {Promise<{ metaData: null; screenshot: Buffer } | null>} Screenshot result or null if not a video/failed
 */
export async function handleVideoUrl(
	page: Page,
	url: string,
	logger: Logger,
): Promise<null | { metaData: null; screenshot: Buffer }> {
	// Check if URL is a video before page processing
	const urlResponse = await fetch(url);
	const contentType = urlResponse.headers.get("content-type");
	const urlHasVideoContentType = contentType?.startsWith("video/") ?? false;
	const isVideoUrl = urlHasVideoContentType || videoUrlRegex.test(url);

	if (isVideoUrl) {
		logger.info("Video URL detected", { contentType, isVideoUrl });
		const screenshot = await getScreenshotMp4(page, url, logger);

		if (screenshot) {
			// No need to send metadata for video screenshot because we create that page
			return { metaData: null, screenshot };
		}

		logger.warn("Video screenshot failed, falling back to regular screenshot");
	}

	return null;
}
