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

	logger.info("Instagram URL detected");
	let page: GetOrCreatePageReturnType | null = null;

	try {
		// Complete page navigation sequence
		page = await getOrCreatePage({ browser, logger });
		await setupBrowserPage({ logger, page, viewport: INSTAGRAM_VIEWPORT });
		await gotoPage({ logger, page, url });
		if (shouldGetPageMetrics) await getPageMetrics({ logger, page });
		await cloudflareChecker({ logger, page });
		await handleDialogs({ logger, page });

		if (url.includes("/reel/")) {
			const ogImageBuffer = await fetchOgImage({ ...options, page });
			if (ogImageBuffer) {
				const metaData = await extractPageMetadata({ logger, page, url });
				return {
					metaData,
					screenshot: ogImageBuffer,
				};
			}
		}

		// Extract image index from URL parameters
		const imageIndex = extractInstagramImageIndex(url);

		logger.info("Processing Instagram screenshot", {
			imageIndex: imageIndex ?? "default",
			url,
		});
		logger.info("Instagram Post detected");
		const ariaLabel = "Next";
		const index = imageIndex ?? null;

		if (index && index > 1) {
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

		await page.waitForSelector('article div[role="button"]', {
			timeout: 5000,
		});

		const divs = await page.$$("article  div[role='button']");
		logger.debug("Searching for article divs", { found: divs.length });

		if (divs.length > 0) {
			try {
				const targetDiv = divs[2];
				const listItemsHTML = await page.evaluate((div) => {
					const ul = div.querySelector("ul");
					if (!ul) return [];
					return [...ul.querySelectorAll("li")].map((li) =>
						li.outerHTML.trim(),
					);
				}, targetDiv);

				const hasVideo = listItemsHTML[1]?.includes("<video");
				logger.debug("Second list item contains video?", {
					hasVideo,
				});

				//if first post is a video then use og:image ex:https://www.instagram.com/omni.type/p/DMaK1yvtPoI/?img_index=1
				if ((index == 1 || !index) && hasVideo) {
					logger.info(
						"Found Instagram video in post so using og:image instead",
					);
					const ogImageBuffer = await fetchOgImage({ ...options, page });
					if (ogImageBuffer) {
						const metaData = await extractPageMetadata({ logger, page, url });
						return { metaData, screenshot: ogImageBuffer };
					}
				}

				await targetDiv.waitForSelector("img, video", { timeout: 5000 });

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

					const imageRes = await fetch(src);
					if (imageRes.ok) {
						const arrayBuffer = await imageRes.arrayBuffer();
						logger.info("Instagram post image fetched successfully", {
							size: arrayBuffer.byteLength,
						});

						const screenshotBuffer = Buffer.from(arrayBuffer);
						const metaData = await extractPageMetadata({
							logger,
							page,
							url,
						});
						return { metaData, screenshot: screenshotBuffer };
					} else {
						logger.error("Failed to fetch Instagram image", {
							status: imageRes.status,
							url: src,
						});
						return null;
					}
				} else {
					logger.warn("No images found in Instagram post");
					return null;
				}
			} catch (error) {
				logger.error("Error processing Instagram post images", {
					error: getErrorMessage(error),
				});
				return null;
			}
		}

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
