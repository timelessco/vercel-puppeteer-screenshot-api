import { videoUrlRegex } from "./constants";

/**
 * Synchronously checks if a URL has a video file extension
 * @param {string} url - The URL to check
 * @returns {boolean} True if URL has a video file extension
 */
export function isVideoUrlByExtension(url: string): boolean {
	return videoUrlRegex.test(url);
}

/**
 * Checks if a URL points to a video file by examining the file extension
 * and optionally fetching to check content-type
 * @param {string} url - The URL to check
 * @param {boolean} checkContentType - Whether to fetch and check content-type (expensive)
 * @returns {Promise<boolean>} True if URL is a video
 */
export async function isVideoUrl(
	url: string,
	checkContentType = false,
): Promise<boolean> {
	// Quick check: file extension
	if (isVideoUrlByExtension(url)) {
		return true;
	}

	// Expensive check: fetch content-type with timeout
	if (checkContentType) {
		try {
			const response = await fetch(url, {
				method: "HEAD",
				signal: AbortSignal.timeout(5000), // 5 second timeout
			});
			const contentType = response.headers.get("content-type");
			return (
				contentType?.startsWith("video/") ??
				(contentType === "application/vnd.apple.mpegurl" || // HLS
					contentType === "application/dash+xml") // DASH
			);
		} catch {
			return false;
		}
	}

	return false;
}
