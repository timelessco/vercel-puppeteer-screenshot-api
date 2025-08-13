import { getErrorMessage } from "@/utils/errorUtils";
import type { GetScreenshotOptions } from "@/app/try/route";

import {
	launchBrowser,
	type LaunchBrowserReturnType,
} from "../browser/launchBrowser";
import { closePageWithBrowser } from "../browser/pageUtils";

export type WithBrowserOptions = GetScreenshotOptions & {
	browser: LaunchBrowserReturnType;
};

/**
 * Higher-order function to manage browser lifecycle with multiple handlers
 * @param {GetScreenshotOptions} config - Configuration options
 * @param {Function[]} handlers - Handler functions to call with options (tried in sequence)
 * @returns {Promise<T>} Result from the first successful handler or throws error
 */
export async function withBrowser<T>(
	config: GetScreenshotOptions,
	...handlers: Array<(options: WithBrowserOptions) => Promise<null | T>>
): Promise<T> {
	const { headless, logger } = config;
	let browser: LaunchBrowserReturnType | null = null;

	try {
		browser = await launchBrowser({ headless, logger });
		const options = { ...config, browser };

		// Try each handler in sequence until one returns a truthy value
		for (const handler of handlers) {
			const result = await handler(options);
			// Return first truthy result
			if (result) return result;

			logger.debug(`Handler ${handler.name} returned null, trying next`);
		}

		// All handlers returned null - throw error
		throw new Error(
			"All handlers returned null - no screenshot could be captured",
		);
	} catch (error) {
		logger.error("Error in withBrowser", { error: getErrorMessage(error) });
		throw error;
	} finally {
		if (browser) await closePageWithBrowser({ browser, logger });
	}
}
