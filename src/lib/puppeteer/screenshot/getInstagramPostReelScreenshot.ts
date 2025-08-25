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

import { getMetadata, type GetMetadataReturnType } from "../core/getMetadata";
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

		return imgIndexFromUrl ? Number.parseInt(imgIndexFromUrl) : undefined;
	} catch {
		return undefined;
	}
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

interface NavigateCarouselOptions
	extends GetInstagramPostReelScreenshotHelperOptions {
	index: number;
}

/**
 * Navigates Instagram carousel to specified image index
 * @param {NavigateCarouselOptions} options - Options with page and target index
 * @returns {Promise<void>}
 */
async function navigateCarousel(
	options: NavigateCarouselOptions,
): Promise<void> {
	const { index, logger, page } = options;

	// Handle dialogs only if index is greater than 1 so that we can get the thumbnail image of the video before it starts
	// This is a separate function to handle dialogs only for instagram
	await handleInstagramDialogs({ logger, page });
	// This function act as a fallback if the handleInstagramDialogs fails
	await handleDialogs({ logger, page });

	logger.info("Navigating carousel to image", { targetIndex: index });

	try {
		for (let i = 0; i < index - 1; i++) {
			logger.debug(`Carousel navigation: clicking next (${i + 1}/${index})`);
			await page.locator(`[aria-label="Next"]`).click();
			await new Promise((res) => setTimeout(res, 500));
		}

		logger.debug("Carousel navigation completed");
	} catch (error) {
		logger.warn("Failed to navigate carousel", {
			error: getErrorMessage(error),
			targetIndex: index,
		});
	}
}

interface ExtractInstagramImageOptions
	extends GetInstagramPostReelScreenshotHelperOptions {
	index?: number;
}

/**
 * Extracts Instagram image from article element
 * @param {ExtractInstagramImageOptions} options - Options with page and optional index
 * @returns {Promise<Buffer | null>} Image buffer or null if not found
 */
async function extractInstagramImage(
	options: ExtractInstagramImageOptions,
): Promise<Buffer | null> {
	const { index, logger, page } = options;

	await page.waitForSelector('article div[role="button"]', { timeout: 30_000 });

	const divs = await page.$$("article > div");
	logger.debug("Searching for article divs", { found: divs.length });

	if (divs.length > 1) {
		const targetDiv = divs[1];
		await targetDiv.waitForSelector("img", { timeout: 10_000 });

		const imgs = await targetDiv.$$("img");
		logger.debug("Found Instagram images", { count: imgs.length });

		if (imgs.length === 0) {
			logger.warn("No images found in Instagram post");
			return null;
		}

		const targetIndex = index && index > 1 ? imgs.length - 1 : 0;
		logger.debug("Selecting image", {
			targetIndex,
			totalImages: imgs.length,
		});

		const srcHandle = await imgs[targetIndex].getProperty("src");
		const src = await srcHandle.jsonValue();
		logger.debug("Fetching image from URL", { url: src });

		return await fetchImageDirectly({ ...options, url: src });
	}

	return null;
}

/**
 * Captures screenshot from Instagram posts with carousel and image handling
 * @param {GetInstagramPostReelScreenshotHelperOptions} options - Options containing page, url, and logger
 * @returns {Promise<Buffer | null>} Screenshot buffer or null if capture fails
 */
async function getInstagramPostReelScreenshotHelper(
	options: GetInstagramPostReelScreenshotHelperOptions,
): Promise<Buffer | null> {
	const { logger, url } = options;

	try {
		// Extract image index from URL parameters
		const imageIndex = extractInstagramImageIndex(url);
		logger.info("Processing Instagram screenshot", {
			imageIndex: imageIndex ?? "default",
			url,
		});

		// Navigate carousel if needed
		if (imageIndex && imageIndex > 1) {
			await navigateCarousel({ ...options, index: imageIndex });
		}

		// Try to extract image from article
		const imageBuffer = await extractInstagramImage({
			...options,
			index: imageIndex,
		});
		if (imageBuffer) return imageBuffer;

		// Fallback to og:image
		return await fetchOgImage(options);
	} catch (error) {
		logger.error(
			"Error processing Instagram post images, falling back to ogImage",
			{ error: getErrorMessage(error) },
		);

		// Final fallback to og:image
		return await fetchOgImage(options);
	}
}

type GetInstagramPostReelScreenshotOptions = WithBrowserOptions;

/**
 * Captures screenshot from Instagram posts with special handling for carousels and images
 * @param {GetInstagramPostReelScreenshotOptions} options - Options containing browser, url, logger, and metrics flag
 * @returns {Promise<null | { metaData: GetMetadataReturnType; screenshot: Buffer }>} Screenshot buffer with metadata or null if not an Instagram URL
 */
export async function getInstagramPostReelScreenshot(
	options: GetInstagramPostReelScreenshotOptions,
): Promise<null | { metaData: GetMetadataReturnType; screenshot: Buffer }> {
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

			return { metaData, screenshot };
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
	NavigateCarouselOptions,
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
