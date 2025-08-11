import { imageUrlRegex } from "./constants";

/**
 * Synchronously checks if a URL has an image file extension
 * @param {string} url - The URL to check
 * @returns {boolean} True if URL has an image file extension
 */
export function isImageUrlByExtension(url: string): boolean {
	return imageUrlRegex.test(url);
}

/**
 * Checks if a URL points to an image file by examining the file extension
 * and optionally fetching to check content-type
 * @param {string} url - The URL to check
 * @param {boolean} checkContentType - Whether to fetch and check content-type (expensive)
 * @returns {Promise<boolean>} True if URL is an image
 */
export async function isImageUrl(
	url: string,
	checkContentType = false,
): Promise<boolean> {
	// Quick check: file extension
	if (isImageUrlByExtension(url)) {
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
				contentType?.startsWith("image/") ??
				(contentType === "application/octet-stream" && // Sometimes images are served as binary
					isImageUrlByExtension(url))
			);
		} catch {
			return false;
		}
	}

	return false;
}
