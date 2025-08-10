import { getErrorMessage } from "@/utils/errorUtils";
import type { GetOrCreatePageReturnType } from "@/utils/puppeteer/page-utils";
import type { ProcessUrlReturnType } from "@/utils/puppeteer/url-processor";
import type { GetScreenshotOptions } from "@/app/try/route";

import { INSTAGRAM } from "../constants";
import { captureScreenshot } from "../screenshot-helper";
import { getMetadata } from "./metadata";

interface FetchOgImageOptions {
	logger: GetInstagramScreenshotOptions["logger"];
	page: GetInstagramScreenshotOptions["page"];
}

/**
 * Fetches the og:image meta tag content from Instagram page
 * @param {FetchOgImageOptions} options - Options containing page and logger
 * @returns {Promise<Buffer | null>} Buffer containing the image data or null if not found
 */
async function fetchOgImage(
	options: FetchOgImageOptions,
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
		const imageRes = await fetch(ogImage);
		if (!imageRes.ok) {
			logger.error("Failed to fetch og:image", {
				status: imageRes.status,
				url: ogImage,
			});
			return null;
		}

		const arrayBuffer = await imageRes.arrayBuffer();
		logger.info("Instagram og:image fetched successfully", {
			size: arrayBuffer.byteLength,
		});

		return Buffer.from(arrayBuffer);
	} catch (error) {
		logger.error("Error fetching og:image", {
			error: getErrorMessage(error),
			url: ogImage,
		});
		return null;
	}
}

interface GetInstagramScreenshotOptions {
	logger: GetScreenshotOptions["logger"];
	page: GetOrCreatePageReturnType;
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
 * @returns {Promise<null | { metaData: Awaited<ReturnType<typeof getMetadata>>; screenshot: Buffer }>} Screenshot buffer with metadata or null if not an Instagram URL
 */
export async function getInstagramScreenshot(
	options: GetInstagramScreenshotOptions,
): Promise<null | {
	metaData: Awaited<ReturnType<typeof getMetadata>>;
	screenshot: Buffer;
}> {
	const { logger, page, url } = options;

	// Check if this is an Instagram URL
	if (!url.includes(INSTAGRAM)) {
		return null;
	}

	// Extract image index from URL parameters
	const imageIndex = extractInstagramImageIndex(url);

	logger.info("Instagram URL detected");
	logger.info("Processing Instagram screenshot", {
		imageIndex: imageIndex ?? "default",
		url,
	});

	try {
		logger.info("Instagram Post detected");
		const ariaLabel = "Next";
		const index = imageIndex ?? null;

		if (index && index > 1) {
			logger.info("Navigating carousel to image", { targetIndex: index });

			try {
				for (let i = 0; i < index; i++) {
					logger.debug(
						`Carousel navigation: clicking next (${i + 1}/${index})`,
					);
					await page.waitForSelector(`[aria-label="${ariaLabel}"]`, {
						visible: true,
					});
					await page.click(`[aria-label="${ariaLabel}"]`);
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

		let screenshotBuffer: Buffer | null = null;

		const divs = await page.$$("article > div");
		logger.debug("Searching for article divs", { found: divs.length });

		if (divs.length > 0) {
			try {
				const imgs = await divs[1].$$("img");
				logger.debug("Found Instagram images", { count: imgs.length });

				if (imgs.length > 0) {
					const targetIndex = index && index > 1 ? 1 : 0;
					logger.debug("Selecting image", {
						targetIndex,
						totalImages: imgs.length,
					});

					const srcHandle = await imgs[targetIndex].getProperty("src");
					const src = await srcHandle.jsonValue();
					logger.debug("Fetching image from URL", { url: src });

					const imageRes = await fetch(src);
					if (imageRes.ok) {
						const arrayBuffer = await imageRes.arrayBuffer();
						logger.info("Instagram post image fetched successfully", {
							size: arrayBuffer.byteLength,
						});

						screenshotBuffer = Buffer.from(arrayBuffer);
					} else {
						logger.error("Failed to fetch Instagram image", {
							status: imageRes.status,
							url: src,
						});
					}
				} else {
					logger.warn("No images found in Instagram post");
				}
			} catch (error) {
				logger.error("Error processing Instagram post images", {
					error: getErrorMessage(error),
				});
			}
		}

		// Try og:image as second fallback
		if (!screenshotBuffer) {
			logger.info("Falling back to og:image for Instagram Post");
			const ogImageBuffer = await fetchOgImage({ logger, page });
			if (ogImageBuffer) {
				screenshotBuffer = ogImageBuffer;
			}
		}

		// Final fallback: take a page screenshot
		if (!screenshotBuffer) {
			logger.warn(
				"No Instagram image found via DOM or og:image, falling back to page screenshot",
			);
			const screenshot = await captureScreenshot({
				logger,
				target: page,
				timerLabel: "Instagram fallback screenshot",
			});
			logger.info("Fallback page screenshot taken successfully", {
				size: screenshot.byteLength,
			});
			screenshotBuffer = Buffer.from(screenshot);
		}

		const metaData = await getMetadata({ logger, page, url });
		logger.info("Instagram screenshot captured successfully");
		return { metaData, screenshot: screenshotBuffer };
	} catch (error) {
		logger.warn(
			"Instagram screenshot failed, falling back to page screenshot",
			{
				error: getErrorMessage(error),
			},
		);

		return null;
	}
}
