import type { ElementHandle } from "rebrowser-puppeteer-core";

import { setupBrowserPage } from "@/lib/puppeteer/browser-setup/setupBrowserPage";
import type { LaunchBrowserReturnType } from "@/lib/puppeteer/browser/launchBrowser";
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
import { extractTwitterMediaUrls } from "@/lib/twitter/extractMediaUrls";
import { getErrorMessage } from "@/utils/errorUtils";
import type { GetScreenshotOptions, ScreenshotResult } from "@/app/try/route";

import { getMetadata } from "../core/getMetadata";
import { captureScreenshot } from "./captureScreenshot";
import { fetchImageDirectly } from "./getImageScreenshot";

interface GetTwitterScreenshotHelperOptions {
	logger: GetTwitterScreenshotOptions["logger"];
	page: GetOrCreatePageReturnType;
	url: GetTwitterScreenshotOptions["url"];
}

interface GetTwitterScreenshotOptions extends GetScreenshotOptions {
	browser: LaunchBrowserReturnType;
	/** Whether to extract media URLs before taking screenshot */
	extractMediaUrls?: boolean;
}

interface ExtractTwitterMediaResult {
	allImages: Buffer[];
	allVideos: string[];
}

/**
 * Captures screenshot of Twitter/X content by finding the appropriate element
 * @param {GetTwitterScreenshotHelperOptions} options - Options containing page, url, and logger
 * @returns {Promise<Buffer | null>} Screenshot buffer or null if capture fails
 */
async function getTwitterScreenshotHelper(
	options: GetTwitterScreenshotHelperOptions,
): Promise<Buffer | null> {
	const { logger, page, url: urlStr } = options;
	logger.info("Processing X/Twitter screenshot", { url: urlStr });

	try {
		// Wait for Twitter content to be loaded
		logger.debug("Waiting for X/Twitter content to load");
		await page.waitForSelector("main", { timeout: 10_000 }).catch(() => {
			logger.warn("Main element not found, continuing anyway");
		});

		// Hide the bottom bar (sign up/login prompt) if it exists
		logger.debug("Checking for X/Twitter bottom bar");
		await page
			.evaluate(() => {
				const bottomBar = document.querySelector('[data-testid="BottomBar"]');
				if (bottomBar && bottomBar instanceof HTMLElement) {
					bottomBar.style.display = "none";
					return true;
				}
				return false;
			})
			.then((hidden) => {
				if (hidden) {
					logger.debug("Hidden X/Twitter bottom bar");
				}
			})
			.catch(() => {
				logger.debug("No bottom bar found or error hiding it");
			});

		// Handle status/tweet pages
		if (urlStr.includes("/status/")) {
			logger.info("X/Twitter status page detected, targeting article element");

			try {
				const article = await page
					.locator("article")
					.setTimeout(5000)
					.waitHandle();

				logger.debug("Article element found for tweet");
				const screenshot = await captureScreenshot({
					logger,
					target: article,
					timerLabel: "X/Twitter tweet screenshot",
				});

				logger.info("Tweet screenshot captured successfully", {
					size: screenshot.length,
				});
				return screenshot;
			} catch (error) {
				logger.warn(
					"Article element not found for status page, will try fallback",
					{ error: getErrorMessage(error) },
				);
			}
		}

		// Handle profile and other pages - look for content container
		logger.debug("X/Twitter: Searching for main content container");
		const element = await page.evaluateHandle(() => {
			const main = document.querySelector("main");
			if (!main) return null;

			const divs = main.querySelectorAll("div");
			for (const div of divs) {
				const firstChild = div.firstElementChild;
				if (
					firstChild &&
					firstChild.tagName === "A"
					// && firstChild?.getAttribute('aria-hidden') === 'true'
				) {
					return div;
				}
			}

			return null;
		});

		const elementHandle = element.asElement();
		if (elementHandle) {
			try {
				const screenshot = await captureScreenshot({
					logger,
					target: elementHandle as ElementHandle,
					timerLabel: "X/Twitter content screenshot",
				});

				logger.debug("Found X/Twitter content container element");
				logger.info("X/Twitter content screenshot captured successfully", {
					size: screenshot.length,
				});
				return screenshot;
			} catch (error) {
				logger.warn("Error capturing X/Twitter content screenshot", {
					error: getErrorMessage(error),
				});
				return null;
			}
		}

		logger.warn("Could not find suitable X/Twitter content container");
		return null;
	} catch (error) {
		logger.error("Error capturing X/Twitter screenshot", {
			error: getErrorMessage(error),
		});
		return null;
	}
}

/**
 * Extracts media (images and videos) from Twitter post using Syndication API
 * @param {GetTwitterScreenshotOptions} options - Options containing browser, url, and logger
 * @returns {Promise<ExtractTwitterMediaResult>} Object with allImages and allVideos arrays
 */
async function extractTwitterMedia(
	options: GetTwitterScreenshotOptions,
): Promise<ExtractTwitterMediaResult> {
	const { logger, url } = options;

	try {
		logger.info(
			"Attempting to extract Twitter media URLs before screenshot (Syndication API)",
		);

		const extractionResult = await extractTwitterMediaUrls({
			logger,
			url,
		});

		logger.info("Extraction result", { extractionResult });

		if (extractionResult.success && extractionResult.media) {
			const results = await Promise.allSettled(
				extractionResult.media.images.map((image) =>
					fetchImageDirectly({ ...options, url: image.url }),
				),
			);

			const allImages = results
				.map((result, index) => {
					if (result.status === "fulfilled") {
						return result.value;
					}
					logger.warn("Failed to fetch Twitter image", {
						index,
						reason: result.reason,
					});
					return null;
				})
				.filter((buffer): buffer is Buffer => buffer !== null);

			logger.info("Successfully fetched Twitter image buffers", {
				fetched: allImages.length,
				total: extractionResult.media.images.length,
			});

			const allVideos = extractionResult.media.videos;

			logger.info("✓ Successfully extracted Twitter media URLs", {
				images: allImages.length,
				videos: allVideos.length,
			});

			return { allImages, allVideos };
		}

		logger.warn("Syndication API failed, will capture screenshot only", {
			error: extractionResult.error,
		});
		return { allImages: [], allVideos: [] };
	} catch (error) {
		logger.warn("Error during media extraction, continuing with screenshot", {
			error: getErrorMessage(error),
		});
		return { allImages: [], allVideos: [] };
	}
}

export async function getTwitterScreenshot(
	options: GetTwitterScreenshotOptions,
): Promise<null | ScreenshotResult> {
	const { browser, logger, shouldGetPageMetrics, url } = options;

	logger.info("X/Twitter URL detected");
	let page: GetOrCreatePageReturnType | null = null;

	// Extract media using Syndication API
	const { allImages, allVideos } = await extractTwitterMedia(options);

	try {
		page = await getOrCreatePage({ browser, logger });
		await setupBrowserPage({
			logger,
			mediaFeatures: [
				{ name: "prefers-color-scheme", value: "light" },
				{ name: "prefers-reduced-motion", value: "reduce" },
			],
			page,
		});
		await gotoPage({ logger, page, url });
		if (shouldGetPageMetrics) await getPageMetrics({ logger, page });
		await cloudflareChecker({ logger, page });
		await handleDialogs({ logger, page });

		const screenshot = await getTwitterScreenshotHelper({ logger, page, url });
		if (screenshot) {
			const metaData = await getMetadata({
				//here we set the isPageScreenshot to true since the screenshot is 2x
				isPageScreenshot: true,
				logger,
				page,
				url,
			});
			logger.info("X/Twitter screenshot captured successfully");
			return {
				allImages,
				allVideos,
				metaData,
				screenshot,
			};
		}

		logger.info(
			"No X/Twitter target element found, falling back to page screenshot",
		);
		return null;
	} catch (error) {
		logger.warn("X/Twitter screenshot failed, returning null for fallback", {
			error: getErrorMessage(error),
		});
		return null;
	} finally {
		if (page) await closePageSafely({ logger, page });
	}
}
