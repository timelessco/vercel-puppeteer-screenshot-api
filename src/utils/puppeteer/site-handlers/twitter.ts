import { ElementHandle, type JSHandle } from "rebrowser-puppeteer-core";

import { getErrorMessage } from "@/utils/errorUtils";
import type { GetOrCreatePageReturnType } from "@/utils/puppeteer/page-utils";
import type { ProcessUrlReturnType } from "@/utils/puppeteer/url-processor";
import type { GetScreenshotOptions } from "@/app/try/route";

import { TWITTER, X } from "../constants";
import { captureScreenshot } from "../screenshot-helper";
import { getMetadata } from "./metadata";

type GetTwitterElementOptions = GetScreenshotTwitterOptions;

/**
 * Finds the appropriate element to screenshot on X/Twitter pages
 * @param {GetTwitterElementOptions} options - Options containing page, url, and logger
 * @returns {Promise<ElementHandle<HTMLElement> | JSHandle<HTMLDivElement | null> | null>} Element to screenshot or null
 */
async function getTwitterElement(
	options: GetTwitterElementOptions,
): Promise<
	ElementHandle<HTMLElement> | JSHandle<HTMLDivElement | null> | null
> {
	const { logger, page, url: urlStr } = options;
	logger.info("Processing X/Twitter screenshot", { url: urlStr });

	try {
		if (urlStr.includes("/status/")) {
			logger.info("X/Twitter status page detected, targeting article element");
			const article = await page.$("article");

			if (article) {
				logger.debug("Article element found for tweet");
				return article;
			} else {
				logger.warn(
					"Article element not found for status page, will use page screenshot",
				);
				return null; // Explicitly return null to trigger page screenshot fallback
			}
		}

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

		// Check if element exists using a different approach since JSHandle doesn't have a truthy check
		const hasElement = await element
			.jsonValue()
			.then((val) => val !== null)
			.catch(() => false);

		if (hasElement) {
			logger.debug("Found X/Twitter content container element");
			return element;
		} else {
			logger.warn(
				"Could not find suitable X/Twitter content container, will use page screenshot",
			);
			return null;
		}
	} catch (error) {
		logger.error(
			"Error in X/Twitter screenshot selection, using page fallback",
			{
				error: getErrorMessage(error),
			},
		);
		return null;
	}
}

interface GetScreenshotTwitterOptions {
	logger: GetScreenshotOptions["logger"];
	page: GetOrCreatePageReturnType;
	url: ProcessUrlReturnType;
}

/**
 * Captures screenshot from X/Twitter with special handling for tweets and profiles
 * @param {GetScreenshotTwitterOptions} options - Options containing page, url, and logger
 * @returns {Promise<null | { metaData: Awaited<ReturnType<typeof getMetadata>>; screenshot: Buffer }>} Screenshot buffer with metadata or null if not a Twitter URL
 */
export async function getTwitterScreenshot(
	options: GetScreenshotTwitterOptions,
): Promise<null | {
	metaData: Awaited<ReturnType<typeof getMetadata>>;
	screenshot: Buffer;
}> {
	const { logger, page, url } = options;

	// Check if this is an X/Twitter URL
	if (!url.includes(X) && !url.includes(TWITTER)) {
		return null;
	}

	try {
		logger.info("X/Twitter URL detected");
		const screenshotTarget = await getTwitterElement({ logger, page, url });

		if (screenshotTarget && "screenshot" in screenshotTarget) {
			const screenshot = await captureScreenshot({
				logger,
				target: screenshotTarget,
				timerLabel: "X/Twitter element screenshot capture",
			});
			const metaData = await getMetadata({ logger, page, url });

			logger.info("X/Twitter screenshot captured successfully");
			return { metaData, screenshot };
		}
		logger.info(
			"No X/Twitter target element found, falling back to page screenshot",
		);
	} catch (error) {
		logger.warn(
			"X/Twitter screenshot failed, falling back to page screenshot",
			{ error: getErrorMessage(error) },
		);
	}

	return null;
}
