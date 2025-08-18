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

import { extractPageMetadata } from "../core/extractPageMetadata";
import type { WithBrowserOptions } from "../core/withBrowser";
import { fetchImageDirectly } from "./getImageScreenshot";

interface FetchOgImageOptions extends GetInstagramScreenshotOptions {
	page: GetOrCreatePageReturnType;
}

const INSTAGRAM_VIEWPORT = {
	deviceScaleFactor: 3,
	hasTouch: true,
	height: 844,
	isMobile: true,
	width: 390,
};

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
		return await fetchImageDirectly({ ...options, url: ogImage });
	} catch (error) {
		logger.error("Error fetching og:image", {
			error: getErrorMessage(error),
			url: ogImage,
		});

		return null;
	}
}

type GetInstagramScreenshotOptions = WithBrowserOptions;

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
export async function getInstagramPostReelScreenshot(
	options: GetInstagramScreenshotOptions,
): Promise<null | {
	metaData: Awaited<ReturnType<typeof extractPageMetadata>>;
	screenshot: Buffer;
}> {
	const { browser, logger, shouldGetPageMetrics, url } = options;

	logger.info("Instagram POST or REEL detected");
	let page: GetOrCreatePageReturnType | null = null;

	try {
		// Complete page navigation sequence
		page = await getOrCreatePage({ browser, logger });
		await setupBrowserPage({ logger, page, viewport: INSTAGRAM_VIEWPORT });
		await gotoPage({ logger, page, url });
		if (shouldGetPageMetrics) await getPageMetrics({ logger, page });
		await cloudflareChecker({ logger, page });
		try {
			// Extract image index from URL parameters
			const imageIndex = extractInstagramImageIndex(url);

			logger.info("Processing Instagram screenshot", {
				imageIndex: imageIndex ?? "default",
				url,
			});
			const index = imageIndex ?? null;

			if (index && index > 1) {
				const ariaLabel = "Next";

				// we handle dialogs only if index is greater than 1 so that we can get the thumbnail image of the video before it starts
				await handleDialogs({ logger, page });

				logger.info("Navigating carousel to image", { targetIndex: index });

				try {
					for (let i = 0; i < index - 1; i++) {
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

			// await page.waitForSelector('article div[role="button"]', {
			// 	timeout: 5000,
			// });

			const divs = await page.$$("article > div");
			logger.debug("Searching for article divs", { found: divs.length });

			if (divs.length > 2) {
				const targetDiv = divs[1];

				await targetDiv.waitForSelector("img", { timeout: 5000 });

				const imgs = await targetDiv.$$("img");
				logger.debug("Found Instagram images", { count: imgs.length });

				if (imgs.length > 0) {
					const targetIndex = index && index > 1 ? imgs.length - 1 : 0;
					logger.debug("Selecting image", {
						targetIndex,
						totalImages: imgs.length,
					});

					const srcHandle = await imgs[targetIndex].getProperty("src");
					const src = await srcHandle.jsonValue();
					logger.debug("Fetching image from URL", { url: src });

					const screenshotBuffer = await fetchImageDirectly({
						...options,
						url: src,
					});
					const metaData = await extractPageMetadata({
						logger,
						page,
						url,
					});
					return { metaData, screenshot: screenshotBuffer };
				} else {
					logger.warn("No images found in Instagram post");

					const ogImageBuffer = await fetchOgImage({ ...options, page });
					if (!ogImageBuffer) {
						return null;
					}
					const metaData = await extractPageMetadata({ logger, page, url });
					return {
						metaData,
						screenshot: ogImageBuffer,
					};
				}
			}

			const ogImageBuffer = await fetchOgImage({ ...options, page });
			if (!ogImageBuffer) {
				return null;
			}
			const metaData = await extractPageMetadata({ logger, page, url });
			return {
				metaData,
				screenshot: ogImageBuffer,
			};
		} catch (error) {
			logger.error(
				"Error processing Instagram post images, falling back to ogImage",
				{
					error: getErrorMessage(error),
				},
			);

			const ogImageBuffer = await fetchOgImage({ ...options, page });
			if (!ogImageBuffer) {
				return null;
			}
			const metaData = await extractPageMetadata({ logger, page, url });
			return {
				metaData,
				screenshot: ogImageBuffer,
			};
		}
	} catch (error) {
		logger.warn("Instagram screenshot failed, returning null for fallback", {
			error: getErrorMessage(error),
		});

		return null;
	} finally {
		if (page) await closePageSafely({ logger, page });
	}
}
