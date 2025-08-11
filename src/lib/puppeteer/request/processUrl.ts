import getVideoId from "get-video-id";

import type { GetScreenshotOptions } from "@/app/try/route";

import { YOUTUBE, YOUTUBE_THUMBNAIL_URL } from "../core/constants";

interface ProcessUrlOptions {
	logger: GetScreenshotOptions["logger"];
	url: GetScreenshotOptions["url"];
}

/**
 * Process URL for special cases like YouTube thumbnails
 * Returns the processed URL or original if no processing needed
 * @param {ProcessUrlOptions} options - Options containing url and logger
 * @returns {string} The processed URL or original if no processing needed
 */
export function processUrl(options: ProcessUrlOptions): string {
	const { logger, url } = options;

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

export type ProcessUrlReturnType = Awaited<ReturnType<typeof processUrl>>;
