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

export type GetInstagramPostReelScreenshotOptions = WithBrowserOptions;

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

		const { caption, mediaList } = await extractInstagramMediaUrls({
			logger,
			url,
		});
		logger.debug("Extracted media", { caption, count: mediaList.length });

		const mediaWithThumbnails = mediaList.filter((m) => m.thumbnail);
		const results = await Promise.allSettled(
			mediaWithThumbnails.map((m) =>
				fetchImageDirectly({ ...options, url: m.thumbnail! }),
			),
		);

		const allImages: Buffer[] = results
			.filter((result) => result.status === "fulfilled")
			.map((result) => result.value);

		const allVideos = mediaList
			.filter((m) => m.type === "video")
			.map((m) => m.url);

		const selectedIndex = extractInstagramImageIndex(url) ?? 0;

		if (selectedIndex >= allImages.length || allImages.length === 0) {
			logger.warn("No images available or invalid index", {
				availableImages: allImages.length,
				imageIndex: selectedIndex,
			});
			return null;
		}

		const screenshot = allImages[selectedIndex];

		return {
			allImages,
			allVideos,
			metaData: caption
				? {
						description: caption,
						favIcon: null,
						isPageScreenshot: false,
						ogImage: null,
						title: "Instagram Post",
					}
				: null,
			screenshot,
		};
	} catch (error) {
		logger.warn("Instagram screenshot failed, returning null for fallback", {
			error: getErrorMessage(error),
		});

		return null;
	}
}
