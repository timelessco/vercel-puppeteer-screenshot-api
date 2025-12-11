import { extractInstagramMediaUrls } from "@/lib/platforms/instagram/extractMediaUrls";
import { getErrorMessage } from "@/utils/errorUtils";
import type { ScreenshotResult } from "@/app/try/route";

import type { WithBrowserOptions } from "../core/withBrowser";
import { fetchImageDirectly } from "./getImageScreenshot";

/**
 * Extracts Instagram image index from URL parameters
 * @param {string} url - The Instagram URL to parse
 * @returns {number | undefined} The image index if present, undefined otherwise
 */
function extractInstagramImageIndex(url: string): number | undefined {
	try {
		const urlObj = new URL(url);
		const imgIndexFromUrl = urlObj.searchParams.get("img_index");

		return imgIndexFromUrl ? Number.parseInt(imgIndexFromUrl) - 1 : undefined;
	} catch {
		return undefined;
	}
}

type GetInstagramPostReelScreenshotOptions = WithBrowserOptions;

/**
 * Captures screenshot from Instagram posts with special handling for carousels and images
 * @param {GetInstagramPostReelScreenshotOptions} options - Options containing browser, url, logger, and metrics flag
 * @returns {Promise<ScreenshotResult | null>} Screenshot buffer with metadata or null if not an Instagram URL
 */
export async function getInstagramPostReelScreenshot(
	options: GetInstagramPostReelScreenshotOptions,
): Promise<null | ScreenshotResult> {
	const { logger, url } = options;

	try {
		logger.info("Instagram POST or REEL detected");

		const media = await extractInstagramMediaUrls(url, logger);
		logger.debug("Extracted media", { count: media.length, media });

		const results = await Promise.allSettled(
			media.map((m) =>
				fetchImageDirectly({ ...options, url: m.thumbnail ?? "" }),
			),
		);

		const allImages: Buffer[] = results.map((result) => {
			if (result.status === "fulfilled") {
				return result.value;
			}

			return Buffer.alloc(0);
		});

		const allVideos = media.filter((m) => m.type === "video").map((m) => m.url);

		const imageIndex = extractInstagramImageIndex(url);

		const screenshot = allImages[imageIndex ?? 0];

		return {
			allImages,
			allVideos,
			metaData: null,
			screenshot,
		};
	} catch (error) {
		logger.warn("Instagram screenshot failed, returning null for fallback", {
			error: getErrorMessage(error),
		});

		return null;
	}
}
