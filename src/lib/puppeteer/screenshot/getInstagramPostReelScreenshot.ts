import { extractInstagramMediaUrls } from "@/lib/platforms/instagram/extractMediaUrls";
import {
	extractInstagramImageIndex,
	getInstagramPostReelScreenshotHelper,
	truncateInstagramTitle,
} from "@/lib/platforms/instagram/helpers";
import { setupBrowserPage } from "@/lib/puppeteer/browser-setup/setupBrowserPage";
import {
	closePageSafely,
	getOrCreatePage,
	getPageMetrics,
	type GetOrCreatePageReturnType,
} from "@/lib/puppeteer/browser/pageUtils";
import { cloudflareChecker } from "@/lib/puppeteer/navigation/cloudflareChecker";
import { gotoPage } from "@/lib/puppeteer/navigation/navigationUtils";
import { getErrorMessage } from "@/utils/errorUtils";
import type { ScreenshotResult } from "@/app/try/route";

import { getMetadata } from "../core/getMetadata";
import type { WithBrowserOptions } from "../core/withBrowser";
import { fetchImageDirectly } from "./getImageScreenshot";

const INSTAGRAM_VIEWPORT = {
	deviceScaleFactor: 3,
	hasTouch: true,
	height: 844,
	isMobile: true,
	width: 390,
};
const INSTAGRAM_USER_AGENT =
	"Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

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

		const extraction = await extractInstagramMediaUrls({
			logger,
			url,
		});

		if (!extraction.success) {
			logger.warn("Instagram extraction failed", {
				error: extraction.error,
				recoverable: extraction.recoverable,
			});
			throw new Error(extraction.error);
		}

		const { caption, mediaList } = extraction.data;
		logger.debug("Extracted media", { caption, count: mediaList.length });

		const mediaWithThumbnails = mediaList.filter((m) => m.thumbnail);

		const BATCH_SIZE = 5;
		const allImages: Buffer[] = [];
		const failures: Array<{ error: string; index: number; url: string }> = [];

		for (let i = 0; i < mediaWithThumbnails.length; i += BATCH_SIZE) {
			const batch = mediaWithThumbnails.slice(i, i + BATCH_SIZE);
			const batchResults = await Promise.allSettled(
				batch.map((m) => fetchImageDirectly({ ...options, url: m.thumbnail! })),
			);

			for (const [j, result] of batchResults.entries()) {
				const globalIndex = i + j;
				if (result.status === "fulfilled") {
					allImages.push(result.value);
				} else {
					failures.push({
						error: getErrorMessage(result.reason),
						index: globalIndex,
						url: mediaWithThumbnails[globalIndex]?.thumbnail ?? "",
					});
				}
			}
		}

		if (failures.length > 0) {
			logger.warn("Some Instagram images failed to fetch", { failures });
		}

		// If embed extraction produced no images, treat as failure to trigger fallback
		if (allImages.length === 0) {
			throw new Error("No images extracted from Instagram embed");
		}

		const allVideos = mediaList
			.filter((m) => m.type === "video")
			.map((m) => m.url);

		const selectedIndex = extractInstagramImageIndex(url) ?? 0;

		if (selectedIndex >= allImages.length || allImages.length === 0) {
			throw new Error(
				`No images available or invalid index (index=${selectedIndex}, available=${allImages.length})`,
			);
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
		logger.warn(
			"Instagram screenshot failed, using puppeteer to extract media",
			{
				error: getErrorMessage(error),
			},
		);

		try {
			const fallback = await extractInstagramMediaUrlsPuppeteer(options);
			if (fallback) {
				logger.info("Fallback Instagram flow succeeded");
				return fallback;
			}
		} catch (legacyError) {
			logger.warn("Fallback Instagram flow failed", {
				error: getErrorMessage(legacyError),
			});
		}

		return null;
	}
}

/**
 * Legacy fallback that replays the previous Instagram screenshot flow.
 * @param {GetInstagramPostReelScreenshotOptions} options - With browser, url, logger, and metrics flag
 * @returns {Promise<ScreenshotResult | null>} Screenshot data or null on failure
 */
async function extractInstagramMediaUrlsPuppeteer(
	options: GetInstagramPostReelScreenshotOptions,
): Promise<null | ScreenshotResult> {
	const { browser, logger, shouldGetPageMetrics, url } = options;

	logger.info("Starting legacy Instagram screenshot flow");
	let page: GetOrCreatePageReturnType | null = null;

	try {
		// Complete page navigation sequence
		page = await getOrCreatePage({ browser, logger });
		await setupBrowserPage({
			logger,
			page,
			// This user agent slightly reduces the chance of getting redirected to a login page
			userAgent: INSTAGRAM_USER_AGENT,
			viewport: INSTAGRAM_VIEWPORT,
		});
		await gotoPage({ logger, page, url });
		if (shouldGetPageMetrics) await getPageMetrics({ logger, page });
		await cloudflareChecker({ logger, page });

		const screenshot = await getInstagramPostReelScreenshotHelper({
			...options,
			page,
		});
		if (screenshot) {
			// We don't use the isPageScreenshot flag since we get the image directly
			const metaData = await getMetadata({ logger, page, url });
			logger.info("Instagram screenshot captured successfully (legacy)");

			// Process metadata without mutation - extract title, process it, merge back
			const processedMetadata = metaData
				? {
						...metaData,
						title: truncateInstagramTitle(metaData.title) ?? undefined,
					}
				: metaData;
			return {
				allImages: screenshot.imageBuffers,
				allVideos: [],
				metaData: processedMetadata,
				screenshot: screenshot.imageBuffer,
			};
		}

		logger.info("No Instagram content found in legacy flow");
		return null;
	} catch (error) {
		logger.warn("Fallback Instagram screenshot failed", {
			error: getErrorMessage(error),
		});

		return null;
	} finally {
		if (page) await closePageSafely({ logger, page });
	}
}
