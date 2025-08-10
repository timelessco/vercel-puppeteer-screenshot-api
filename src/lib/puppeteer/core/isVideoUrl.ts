import { videoUrlRegex } from "./constants";

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
	if (videoUrlRegex.test(url)) {
		return true;
	}

	// Expensive check: fetch content-type
	if (checkContentType) {
		try {
			const response = await fetch(url, { method: "HEAD" });
			const contentType = response.headers.get("content-type");
			return contentType?.startsWith("video/") ?? false;
		} catch {
			return false;
		}
	}

	return false;
}
