import {
	ElementHandle,
	type JSHandle,
	type Page,
} from "rebrowser-puppeteer-core";

import { getErrorMessage } from "@/utils/errorUtils";

import type { Logger } from "../logger";

export async function getScreenshotX(
	page: Page,
	urlStr: string,
	logger: Logger,
): Promise<
	ElementHandle<HTMLElement> | JSHandle<HTMLDivElement | null> | null
> {
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
