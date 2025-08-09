import type { Page } from "rebrowser-puppeteer-core";

import { getErrorMessage } from "@/utils/errorUtils";

import type { Logger } from "../logger";
import { captureScreenshot } from "../screenshot-helper";

async function fetchOgImage(
	page: Page,
	logger: Logger,
): Promise<Buffer | null> {
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

export async function getScreenshotInstagram(
	page: Page,
	urlStr: string,
	imageIndex: string | undefined,
	logger: Logger,
): Promise<Buffer | null> {
	logger.info("Processing Instagram screenshot", {
		imageIndex: imageIndex ?? "default",
		url: urlStr,
	});

	try {
		logger.info("Instagram Post detected");
		const ariaLabel = "Next";
		const index = imageIndex ? Number.parseInt(imageIndex) : null;

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

						return Buffer.from(arrayBuffer);
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
		logger.info("Falling back to og:image for Instagram Post");
		const ogImageBuffer = await fetchOgImage(page, logger);
		if (ogImageBuffer) {
			return ogImageBuffer;
		}

		// Final fallback: take a page screenshot
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
		return Buffer.from(screenshot);
	} catch (error) {
		logger.error(
			"Critical error in Instagram screenshot handler, using page screenshot fallback",
			{
				error: getErrorMessage(error),
			},
		);

		return null;
	}
}
