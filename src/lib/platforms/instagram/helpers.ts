import type { GetOrCreatePageReturnType } from "@/lib/puppeteer/browser/pageUtils";
import { handleDialogs } from "@/lib/puppeteer/navigation/navigationUtils";
import { fetchImageDirectly } from "@/lib/puppeteer/screenshot/getImageScreenshot";
import type { GetInstagramPostReelScreenshotPuppeteerOptions } from "@/lib/puppeteer/screenshot/getInstagramPostReelScreenshot";
import { getErrorMessage } from "@/utils/errorUtils";

interface InstagramExtractResult {
	imageBuffer: Buffer;
	imageBuffers: Buffer[];
}

interface GetInstagramPostReelScreenshotHelperOptions
	extends GetInstagramPostReelScreenshotPuppeteerOptions {
	page: GetOrCreatePageReturnType;
}

interface ExtractInstagramImageOptions
	extends GetInstagramPostReelScreenshotHelperOptions {
	index?: number;
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
/**
 * Extracts Instagram image index from URL parameters
 * @param {string} url - The Instagram URL to parse
 * @returns {number | undefined} The image index if present, undefined otherwise
 */
export function extractInstagramImageIndex(url: string): number | undefined {
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
export function truncateInstagramTitle(
	title: null | string | undefined,
): string | undefined {
	if (!title) return undefined;

	const colonIndex = title.indexOf(":");
	return colonIndex > 0 ? title.slice(0, colonIndex).trim() : title;
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

	const buffers: Buffer[] = [];
	for (const [index, result] of results.entries()) {
		if (result.status === "fulfilled") {
			buffers.push(result.value);
		} else {
			logger.warn("Failed to fetch carousel image", {
				error: getErrorMessage(result.reason),
				index,
				url: allImages[index],
			});
		}
	}

	logger.info("Collected image sources", {
		count: allImages.length,
		failed: results.filter((r) => r.status === "rejected").length,
		succeeded: results.filter((r) => r.status === "fulfilled").length,
	});

	return buffers;
}
/**
 * Captures screenshot from Instagram posts with carousel and image handling
 * @param {GetInstagramPostReelScreenshotHelperOptions} options - Options containing page, url, and logger
 * @returns {Promise<InstagramExtractResult | null>} Screenshot buffer or null if capture fails
 */
export async function getInstagramPostReelScreenshotHelper(
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
