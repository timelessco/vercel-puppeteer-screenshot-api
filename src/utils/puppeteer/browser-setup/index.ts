import type { Page } from "rebrowser-puppeteer-core";

import type { Logger } from "../logger";
import { setupAdBlocker } from "./ad-blocker";
import { setupCookieConsent } from "./cookie-consent";

const DEFAULT_VIEWPORT = {
	deviceScaleFactor: 2,
	height: 1200,
	width: 1440,
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
	// Set up logging FIRST (before any navigation or script injection) for debugging
	setupLogging(page, logger);

	// Configure viewport (should be done before navigation per Puppeteer docs)
	await page.setViewport(DEFAULT_VIEWPORT);

	await page.emulateMediaFeatures([
		{ name: "prefers-color-scheme", value: "dark" },
	]);

	// Set up ad blocking with Ghostery
	await setupAdBlocker(page, logger);

	// Set up cookie consent handling with DuckDuckGo autoconsent
	await setupCookieConsent(page, logger);
}

/**
 * Sets up logging to capture browser messages/errors
 * @param {Page} page - The Puppeteer page instance
 * @param {Logger} logger - Logger instance for debugging
 */
function setupLogging(page: Page, logger: Logger): void {
	page.on("console", (msg) => {
		const type = msg.type();
		const text = msg.text();
		logger.debug(`Browser console.${type}`, { message: text });
	});

	page.on("pageerror", (err) => {
		logger.debug("Page JS error", { error: err.message });
	});
}
