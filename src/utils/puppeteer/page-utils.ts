import type { Browser, Page } from "rebrowser-puppeteer-core";

import type { Logger } from "./logger";

/**
 * Gets an existing page or creates a new one from the browser.
 * Optimizes by reusing the first empty page if available.
 * @param {Browser} browser - The browser instance
 * @param {Logger} logger - Logger for debugging
 * @returns {Promise<Page>} A page instance ready for use
 */
export async function getOrCreatePage(
	browser: Browser,
	logger: Logger,
): Promise<Page> {
	// Optimize: reuse existing empty page if available
	const pages = await browser.pages();
	const page = pages[0] || (await browser.newPage());

	const allPages = await browser.pages();
	logger.info("Page ready", {
		reusedPage: pages.length > 0,
		totalPages: allPages.length,
	});

	return page;
}

/**
 * Safely closes a page with error handling.
 * @param {Page} page - The page to close
 * @param {Logger} logger - Logger for debugging
 */
export async function closePageSafely(
	page: Page,
	logger: Logger,
): Promise<void> {
	try {
		await page.close();
		logger.debug("Page closed successfully");
	} catch (error: unknown) {
		logger.warn("Failed to close page", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Helper to create a timeout promise
 * @param {number} ms - Timeout in milliseconds
 */
function createTimeoutPromise(ms: number): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => {
			reject(new Error("Browser close timeout"));
		}, ms);
	});
}

/**
 * Gracefully closes browser with timeout protection for Vercel.
 * Issue: browser.close() hangs with @sparticuz/chromium v138 causing 300s timeout
 * Solution: Race condition with 5s timeout + disconnect fallback
 * @param {Browser} browser - The browser instance to close
 * @param {Logger} logger - Logger for debugging
 */
export async function closePageWithBrowser(
	browser: Browser,
	logger: Logger,
): Promise<void> {
	logger.info("Closing browser");

	// Eventhough we close the browser as we open them,
	// We close all pages first - reduces chance of browser.close() hanging
	const pages = await browser.pages();
	logger.info(`Closing ${pages.length} pages`);

	const pageClosePromises = pages.map((page) => closePageSafely(page, logger));
	await Promise.all(pageClosePromises);

	// Try to close browser with timeout protection
	try {
		// Race: browser.close() vs 5-second timeout
		// Prevents infinite hang that causes Vercel 300s timeout
		await Promise.race([browser.close(), createTimeoutPromise(5000)]);

		logger.info("Browser closed successfully");
		return;
	} catch (error) {
		// Fallback to disconnect if close times out
		// In Vercel, container cleanup kills Chrome process anyway
		// Better to return success than timeout after 300s
		logger.warn("Browser.close() timed out, using disconnect", {
			error: error instanceof Error ? error.message : String(error),
		});
		void browser.disconnect();
	}
}
