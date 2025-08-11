import { instagramGetUrl } from "instagram-url-direct";

import type { LaunchBrowserReturnType } from "@/lib/puppeteer/browser/launchBrowser";
import {
	closePageSafely,
	getOrCreatePage,
	type GetOrCreatePageReturnType,
} from "@/lib/puppeteer/browser/pageUtils";
import type { ProcessUrlReturnType } from "@/lib/puppeteer/request/processUrl";
import { getErrorMessage } from "@/utils/errorUtils";
import type { GetScreenshotOptions } from "@/app/try/route";

import { extractPageMetadata } from "../core/extractPageMetadata";

interface FetchOgImageOptions {
	logger: GetInstagramScreenshotOptions["logger"];
	page: GetOrCreatePageReturnType;
}

/**
 * Fetches the og:image meta tag content from Instagram page
 * @param {FetchOgImageOptions} options - Options containing page and logger
 * @returns {Promise<Buffer | null>} Buffer containing the image data or null if not found
 */
// async function fetchOgImage(
// 	options: FetchOgImageOptions,
// ): Promise<Buffer | null> {
// 	const { logger, page } = options;
// 	logger.debug("Attempting to extract og:image");

// 	const ogImage = await page.evaluate(() => {
// 		const meta = document.querySelector('meta[property="og:image"]');

// 		return meta ? meta.getAttribute("content") : null;
// 	});

// 	if (!ogImage) {
// 		logger.debug("No og:image meta tag found");
// 		return null;
// 	}

// 	logger.info("Found Instagram og:image", { url: ogImage });

// 	try {
// 		const imageRes = await fetch(ogImage);
// 		if (!imageRes.ok) {
// 			logger.error("Failed to fetch og:image", {
// 				status: imageRes.status,
// 				url: ogImage,
// 			});
// 			return null;
// 		}

// 		const arrayBuffer = await imageRes.arrayBuffer();
// 		logger.info("Instagram og:image fetched successfully", {
// 			size: arrayBuffer.byteLength,
// 		});

// 		return Buffer.from(arrayBuffer);
// 	} catch (error) {
// 		logger.error("Error fetching og:image", {
// 			error: getErrorMessage(error),
// 			url: ogImage,
// 		});
// 		return null;
// 	}
// }

interface GetInstagramScreenshotOptions {
	browser: LaunchBrowserReturnType;
	logger: GetScreenshotOptions["logger"];
	shouldGetPageMetrics: GetScreenshotOptions["shouldGetPageMetrics"];
	url: ProcessUrlReturnType;
}

/**
 * Extracts Instagram image index from URL parameters
 * @param {string} url - The Instagram URL to parse
 * @returns {number | undefined} The image index if present, undefined otherwise
 */
function extractInstagramImageIndex(url: string): number | undefined {
	try {
		const urlObj = new URL(url);
		const imgIndexFromUrl = urlObj.searchParams.get("img_index");

		return imgIndexFromUrl ? Number.parseInt(imgIndexFromUrl) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Captures screenshot from Instagram posts with special handling for carousels and images
 * @param {GetInstagramScreenshotOptions} options - Options containing page, url, logger, and optional imageIndex
 * @returns {Promise<null | { metaData: Awaited<ReturnType<typeof extractPageMetadata>>; screenshot: Buffer }>} Screenshot buffer with metadata or null if not an Instagram URL
 */
export async function getInstagramScreenshot(
	options: GetInstagramScreenshotOptions,
): Promise<null | {
	metaData: Awaited<ReturnType<typeof extractPageMetadata>>;
	screenshot: Buffer;
}> {
	const { browser, logger, url } = options;

	logger.info("Instagram URL detected");
	let page: GetOrCreatePageReturnType | null = null;

	try {
		// Complete page navigation sequence
		page = await getOrCreatePage({ browser, logger });

		// Extract image index from URL parameters
		const imageIndex = extractInstagramImageIndex(url);

		const index = imageIndex ?? null;

		const data = await instagramGetUrl(url);
		const idx = index ? index - 1 : 0;
		const media = data.media_details[idx];
		logger.info("Instagram post image found", {
			media,
		});
		const thumbnail =
			// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
			media.type === "image" ? media.url : media.thumbnail || null;

		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
		const imageRes = await fetch(thumbnail || "");

		const arrayBuffer = await imageRes.arrayBuffer();
		logger.info("Instagram post image fetched successfully", {
			size: arrayBuffer.byteLength,
		});

		const screenshotBuffer: Buffer | null = Buffer.from(arrayBuffer);

		const metaData = await extractPageMetadata({ logger, page, url });
		logger.info("Instagram thumbnail extracted successfully ");

		return { metaData, screenshot: screenshotBuffer };
	} catch (error) {
		logger.warn("Instagram screenshot failed, returning null for fallback", {
			error: getErrorMessage(error),
		});

		return null;
	} finally {
		if (page) await closePageSafely({ logger, page });
	}
}
