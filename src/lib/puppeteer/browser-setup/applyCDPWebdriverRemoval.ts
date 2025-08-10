import type { SetupBrowserPageOptions } from "./setupBrowserPage";

type ApplyCDPWebdriverRemovalOptions = SetupBrowserPageOptions;

/**
 * Applies early CDP-level webdriver removal before any page scripts load.
 * This is the most critical anti-detection measure as it removes webdriver
 * at the protocol level before JavaScript execution begins.
 * @param {ApplyCDPWebdriverRemovalOptions} options - Configuration options for CDP webdriver removal
 * @returns {Promise<void>}
 */
export async function applyCDPWebdriverRemoval(
	options: ApplyCDPWebdriverRemovalOptions,
): Promise<void> {
	const { logger, page } = options;

	try {
		const client = await page.createCDPSession();
		await client.send("Page.addScriptToEvaluateOnNewDocument", {
			source: `
				// Remove webdriver at the earliest possible stage
				delete Object.getPrototypeOf(navigator).webdriver;

				// Ensure chrome automation is hidden
				if (window.chrome) {
					window.chrome.runtime = window.chrome.runtime || {};
					Object.defineProperty(window.chrome.runtime, 'id', {
						get: () => undefined
					});
				}
			`,
		});
	} catch (error) {
		logger.warn("CDP script injection failed", { error });
	}
}
