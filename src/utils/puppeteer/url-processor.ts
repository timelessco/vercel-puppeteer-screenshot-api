import getVideoId from "get-video-id";

import { YOUTUBE, YOUTUBE_THUMBNAIL_URL } from "./constants";
import type { Logger } from "./logger";

/**
 * Process URL for special cases like YouTube thumbnails
 * Returns the processed URL or original if no processing needed
 * @param {string} url - The URL to process
 * @param {Logger} logger - Logger instance for debugging
 * @returns {string} The processed URL or original if no processing needed
 */
export function processUrl(url: string, logger: Logger): string {
	// YouTube thumbnail processing
	if (url.includes(YOUTUBE)) {
		logger.info("YouTube URL detected, checking for videoId");

		const { id: videoId } = getVideoId(url);
		if (videoId) {
			logger.info("Video ID found, converting YouTube URL to thumbnail URL", {
				videoId,
			});
			return `${YOUTUBE_THUMBNAIL_URL}/${videoId}/maxresdefault.jpg`;
		}
	}

	return url;
}
