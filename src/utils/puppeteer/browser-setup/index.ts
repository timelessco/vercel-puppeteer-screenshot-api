import type { Page } from "rebrowser-puppeteer-core";

import type { Logger } from "../logger";
import { setupAdBlocker } from "./ad-blocker";
import {
	applyAntiDetectionEvasions,
	applyCDPWebdriverRemoval,
} from "./anti-detection";

const DEFAULT_VIEWPORT = {
	deviceScaleFactor: 2,
	height: 1080,
	width: 1920,
};

/**
 * Sets up a Puppeteer page with standard configuration including viewport,
 * media features, ad blocking, and cookie consent handling.
 * Should be called immediately after page creation and before navigation.
 * @param {Page} page - The Puppeteer page instance to configure
 * @param {Logger} logger - Logger instance for debugging and monitoring
 */
export async function setupBrowserPage(
	page: Page,
	logger: Logger,
): Promise<void> {
	// * Disabled to reduce noise in logging
	// Set up logging before any navigation for debugging
	// setupLogging(page, logger);

	await page.setViewport(DEFAULT_VIEWPORT);
	await page.emulateMediaFeatures([
		{ name: "prefers-color-scheme", value: "dark" },
	]);

	// JavaScript-level anti-detection evasions
	await applyAntiDetectionEvasions(page, logger);

	// CDP-level webdriver removal
	await applyCDPWebdriverRemoval(page, logger);

	// Set up ad blocking with Ghostery
	await setupAdBlocker(page, logger);

	// Most of the ad blocking and cookie consent handling is handled by the Ghostery ad blocker
	// Enable this if when you encounter a site that is not blocked by Ghostery
	// Set up cookie consent handling with DuckDuckGo autoconsent
	// await setupCookieConsent(page, logger);
}

/**
 * Sets up logging to capture browser messages/errors
 * @param {Page} page - The Puppeteer page instance
 * @param {Logger} logger - Logger instance for debugging
 */
// function setupLogging(page: Page, logger: Logger): void {
// 	page.on("console", (msg) => {
// 		const type = msg.type();
// 		const text = msg.text();
// 		logger.debug(`[setupLogging] Browser console.${type}`, { message: text });
// 	});

// 	page.on("pageerror", (err) => {
// 		logger.debug("[setupLogging] Page JS error", { error: err.message });
// 	});
// }
