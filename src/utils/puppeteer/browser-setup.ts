import type { Page } from "rebrowser-puppeteer-core";

import { setupCookieBannerBlocker } from "./cookie-banner-removal";
import type { Logger } from "./logger";

// Constants
const BLOCKED_DOMAINS = [
	"googletagmanager",
	"otBannerSdk.js",
	"doubleclick",
	"adnxs.com",
	"google-analytics",
	"googleadservices",
	"facebook.com/tr",
	"connect.facebook.net",
	"hotjar",
	"mixpanel",
	"segment.com",
];

const DEFAULT_VIEWPORT = {
	deviceScaleFactor: 2,
	height: 1200,
	width: 1440,
};

/**
 * Sets up a Puppeteer page with standard configuration including viewport,
 * media features, preload scripts, error handling, and request interception.
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

	await setupRequestInterception(page, logger);

	await setupCookieBannerBlocker(page, logger);
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

/**
 * Configures request interception to block tracking scripts and ads
 * @param {Page} page - The Puppeteer page instance
 * @param {Logger} logger - Logger instance for network logging
 */
async function setupRequestInterception(
	page: Page,
	logger: Logger,
): Promise<void> {
	await page.setRequestInterception(true);

	page.on("request", (req) => {
		const requestUrl = req.url();
		const method = req.method();

		if (BLOCKED_DOMAINS.some((domain) => requestUrl.includes(domain))) {
			logger.logNetworkRequest(requestUrl, method, undefined, true);
			void req.abort();
		} else {
			void req.continue();
		}
	});
}
