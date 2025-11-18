import { setupBrowserPage } from "@/lib/puppeteer/browser-setup/setupBrowserPage";
import {
	closePageSafely,
	getOrCreatePage,
	getPageMetrics,
	type GetOrCreatePageReturnType,
} from "@/lib/puppeteer/browser/pageUtils";
import { cloudflareChecker } from "@/lib/puppeteer/navigation/cloudflareChecker";
import {
	gotoPage,
	handleDialogs,
} from "@/lib/puppeteer/navigation/navigationUtils";
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

/**
 * Truncates Instagram title at the first colon to reduce length
 * Full information is preserved in the description field
 * @param {string | null | undefined} title - The title to truncate
 * @returns {string | undefined} The truncated title or undefined
 */
function truncateInstagramTitle(
	title: null | string | undefined,
): string | undefined {
	if (!title) return undefined;

	const colonIndex = title.indexOf(":");
	return colonIndex > 0 ? title.slice(0, colonIndex).trim() : title;
}

interface GetInstagramPostReelScreenshotHelperOptions
	extends GetInstagramPostReelScreenshotOptions {
	page: GetOrCreatePageReturnType;
}

/**
 * Fetches the og:image meta tag content from Instagram page
 * @param {GetInstagramPostReelScreenshotHelperOptions} options - Options containing page, url, and logger
 * @returns {Promise<Buffer | null>} Buffer containing the image data or null if not found
 */
async function fetchOgImage(
	options: GetInstagramPostReelScreenshotHelperOptions,
): Promise<Buffer | null> {
	const { logger, page } = options;
	logger.debug("Attempting to extract og:image");

	const ogImage = await page.evaluate(() => {
		const meta = document.querySelector('meta[property="og:image"]');

		return meta ? meta.getAttribute("content") : null;
	});

	if (!ogImage) {
		logger.debug("No og:image meta tag found");
		return null;
	}

	logger.info("Found Instagram og:image", { url: ogImage });

	try {
		return await fetchImageDirectly({ ...options, url: ogImage });
	} catch (error) {
		logger.error("Error fetching og:image", {
			error: getErrorMessage(error),
			url: ogImage,
		});

		return null;
	}
}

interface ExtractInstagramImageOptions
	extends GetInstagramPostReelScreenshotHelperOptions {
	index?: number;
}

/**
 * Extracts all Instagram images from carousel by navigating through each slide.
 * Always fetches ALL images regardless of img_index parameter because:
 * - img_index determines which image becomes the primary screenshot
 * - allImages provides additional data for all carousel images
 * @param {ExtractInstagramImageOptions} options - Options with page and optional index
 * @returns {Promise<Buffer[]>} Array of image buffers for all carousel images
 */
async function extractAllInstagramImages(
	options: ExtractInstagramImageOptions,
): Promise<Buffer[]> {
	const { logger, page } = options;
	const collected = new Set<string>();
	const MAX_CAROUSEL_IMAGES = 20;
	let iterations = 0;

	await page.waitForSelector("article", { timeout: 30_000 });

	let hasNext = true;

	while (hasNext && iterations < MAX_CAROUSEL_IMAGES) {
		iterations++;

		// get visible images
		const urls: string[] = await page.$$eval("article img", (imgs) =>
			imgs.map((i) => i.getAttribute("src") ?? "").filter(Boolean),
		);

		urls.forEach((u) => collected.add(u));

		logger.debug("Collected image URLs so far", { count: collected.size });

		// find next button inside carousel
		const nextBtn = await page.$('button[aria-label="Next"]');

		if (!nextBtn) {
			hasNext = false;
			break;
		}

		try {
			await nextBtn.click();
			await new Promise((res) => setTimeout(res, 500));
		} catch {
			logger.debug("No more carousel images");
			hasNext = false;
		}
	}

	if (iterations >= MAX_CAROUSEL_IMAGES) {
		logger.warn("Reached maximum carousel iteration limit", {
			maxIterations: MAX_CAROUSEL_IMAGES,
		});
	}

	// the first image is the logo of the user so we are skipping it
	const allImages = [...collected].slice(1);

	// fetch all images in parallel for better performance
	// use Promise.allSettled to handle partial failures gracefully
	const results = await Promise.allSettled(
		allImages.map((url) => fetchImageDirectly({ ...options, url })),
	);

	const buffers: Buffer[] = results.map((result, index) => {
		if (result.status === "fulfilled") {
			return result.value;
		}

		logger.warn("Failed to fetch carousel image", {
			error: getErrorMessage(result.reason),
			index,
			url: allImages[index],
		});

		// Return empty buffer for failed fetches
		return Buffer.alloc(0);
	});

	logger.info("Collected image sources", {
		count: allImages.length,
		failed: results.filter((r) => r.status === "rejected").length,
		succeeded: results.filter((r) => r.status === "fulfilled").length,
	});

	return buffers;
}
interface InstagramExtractResult {
	imageBuffer: Buffer;
	imageBuffers: Buffer[];
}

/**
 * Captures screenshot from Instagram posts with carousel and image handling
 * @param {GetInstagramPostReelScreenshotHelperOptions} options - Options containing page, url, and logger
 * @returns {Promise<InstagramExtractResult | null>} Screenshot buffer or null if capture fails
 */
async function getInstagramPostReelScreenshotHelper(
	options: GetInstagramPostReelScreenshotHelperOptions,
): Promise<InstagramExtractResult | null> {
	const { logger, url } = options;

	try {
		// Extract image index from URL parameters
		const imageIndex = extractInstagramImageIndex(url);
		logger.info("Processing Instagram screenshot", {
			imageIndex: imageIndex ?? "default",
			url,
		});

		await handleInstagramDialogs({ ...options });
		await handleDialogs({ ...options });

		const imageBuffers = await extractAllInstagramImages(options);

		// Select the primary image based on img_index parameter
		// img_index determines which carousel image becomes the main screenshot
		// while imageBuffers (allImages) contains all carousel images as additional data
		// Clamp index to valid range: default to 0 if no imageIndex, cap at last image index
		const index = Math.min(
			imageIndex ?? 0,
			Math.max(0, imageBuffers.length - 1),
		);

		if (imageBuffers.length > 0) {
			return {
				imageBuffer: imageBuffers[index],
				imageBuffers,
			};
		}

		// Fallback to og:image
		const ogImage = await fetchOgImage(options);
		return ogImage ? { imageBuffer: ogImage, imageBuffers } : null;
	} catch (error) {
		logger.error(
			"Error processing Instagram post images, falling back to ogImage",
			{ error: getErrorMessage(error) },
		);

		// Final fallback to og:image
		const ogImage = await fetchOgImage(options);
		return ogImage ? { imageBuffer: ogImage, imageBuffers: [] } : null;
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
	const { browser, logger, shouldGetPageMetrics, url } = options;

	logger.info("Instagram POST or REEL detected");
	let page: GetOrCreatePageReturnType | null = null;

	try {
		// Complete page navigation sequence
		page = await getOrCreatePage({ browser, logger });
		await setupBrowserPage({
			logger,
			page,
			// This user agent to slightly reduce the chance of getting redirected to a login page
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
			//We don't use the isPageScreenshot flag since we get the image directly
			const metaData = await getMetadata({ logger, page, url });
			logger.info("Instagram screenshot captured successfully");

			// Process metadata without mutation - extract title, process it, merge back
			const processedMetadata = metaData
				? {
						...metaData,
						title: truncateInstagramTitle(metaData.title) ?? undefined,
					}
				: metaData;
			return {
				allImages: screenshot.imageBuffers,
				metaData: processedMetadata,
				screenshot: screenshot.imageBuffer,
			};
		}

		logger.info("No Instagram content found, falling back to page screenshot");
		return null;
	} catch (error) {
		logger.warn("Instagram screenshot failed, returning null for fallback", {
			error: getErrorMessage(error),
		});

		return null;
	} finally {
		if (page) await closePageSafely({ logger, page });
	}
}

type HandleInstagramDialogsOptions = Pick<
	GetInstagramPostReelScreenshotHelperOptions,
	"logger" | "page"
>;

async function handleInstagramDialogs(
	options: HandleInstagramDialogsOptions,
): Promise<void> {
	const { logger, page } = options;

	try {
		await page.locator('[aria-label="Close"]').click();
		logger.info("Clicked [aria-label='Close'] button");
	} catch (error) {
		logger.debug("No [aria-label='Close'] button found or clickable", {
			error,
		});
	}
}
