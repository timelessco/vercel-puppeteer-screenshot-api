import fs from "node:fs";
import path from "node:path";

import { PuppeteerBlocker } from "@ghostery/adblocker-puppeteer";
import fetch from "cross-fetch";
import type { Page } from "rebrowser-puppeteer-core";

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
	// 1. Configure viewport (should be done before navigation per Puppeteer docs)
	await page.setViewport(DEFAULT_VIEWPORT);

	// 2. Emulate media features
	await page.emulateMediaFeatures([
		{ name: "prefers-color-scheme", value: "dark" },
	]);

	// 3. Inject preload script (runs before any page scripts)
	const preloadFile = await loadPreloadScript();
	await page.evaluateOnNewDocument(preloadFile);

	// 4. Set up error handling
	setupErrorHandling(page, logger);

	// 5. Configure request interception
	await setupRequestInterception(page, logger);

	// 6. Initialize cookie banner blocking
	await blockCookieBanners(page, logger);
}

/**
 * Loads the preload script from the filesystem
 * @returns {Promise<string>} The preload script content
 */
function loadPreloadScript(): Promise<string> {
	return Promise.resolve(
		fs.readFileSync(
			path.join(process.cwd(), "/src/utils/puppeteer/preload.js"),
			"utf8",
		),
	);
}

/**
 * Sets up page error handling to suppress expected errors
 * @param {Page} page - The Puppeteer page instance
 * @param {Logger} logger - Logger instance for debugging
 */
function setupErrorHandling(page: Page, logger: Logger): void {
	page.on("pageerror", (err) => {
		if (!err.message.includes("stopPropagation")) {
			logger.debug("Page JS error", { error: err.message });
		}
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

let blocker: null | PuppeteerBlocker = null;

export async function blockCookieBanners(
	page: Page,
	logger: Logger,
): Promise<void> {
	try {
		if (!blocker) {
			blocker = await PuppeteerBlocker.fromLists(fetch, [
				// Cookie banners filter list from EasyList
				"https://secure.fanboy.co.nz/fanboy-cookiemonster.txt",
			]);
			logger.info("Cookie banner blocker initialized successfully");
		}

		// @ts-expect-error - Type mismatch between puppeteer and puppeteer-core
		await blocker.enableBlockingInPage(page);
		logger.info("Cookie banner blocking enabled for page");
	} catch (error) {
		logger.warn("Failed to initialize cookie blocker", {
			error: (error as Error).message,
		});

		// Continue without blocker - manual removal will still work
	}
}
