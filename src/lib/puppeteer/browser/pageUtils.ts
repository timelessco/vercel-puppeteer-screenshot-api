import { getErrorMessage } from "@/utils/errorUtils";
import type { GetScreenshotOptions } from "@/app/try/route";

import type { LaunchBrowserReturnType } from "./launchBrowser";

export interface GetOrCreatePageOptions {
	browser: LaunchBrowserReturnType;
	logger: GetScreenshotOptions["logger"];
}

/**
 * Gets an existing page or creates a new one from the browser
 * Optimizes by reusing the first empty page if available
 * @param {GetOrCreatePageOptions} options - Options containing browser and logger
 * @returns {GetOrCreatePageReturnType} A page instance ready for use
 */
export async function getOrCreatePage(options: GetOrCreatePageOptions) {
	const { browser, logger } = options;

	// Should create a new page to properly utilize the puppeteer-extra plugins to work
	const page = await browser.newPage();

	logger.info("Page ready");
	return page;
}

export type GetOrCreatePageReturnType = Awaited<
	ReturnType<typeof getOrCreatePage>
>;

export interface ClosePageSafelyOptions {
	logger: GetScreenshotOptions["logger"];
	page: GetOrCreatePageReturnType;
}

/**
 * Safely closes a page with error handling
 * @param {ClosePageSafelyOptions} options - Options containing page and logger
 */
export async function closePageSafely(
	options: ClosePageSafelyOptions,
): Promise<void> {
	const { logger, page } = options;

	try {
		await page.close();
		logger.debug("Page closed successfully");
	} catch (error: unknown) {
		logger.warn("Failed to close page", {
			error: getErrorMessage(error),
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

export interface ClosePageWithBrowserOptions {
	browser: LaunchBrowserReturnType;
	logger: GetScreenshotOptions["logger"];
}

/**
 * Gracefully closes browser with timeout protection for Vercel
 * Issue: browser.close() hangs with @sparticuz/chromium v138 causing 300s timeout
 * Solution: Race condition with 5s timeout + disconnect fallback
 * @param {ClosePageWithBrowserOptions} options - Options containing browser and logger
 */
export async function closePageWithBrowser(
	options: ClosePageWithBrowserOptions,
): Promise<void> {
	const { browser, logger } = options;
	logger.info("Closing browser");

	// Eventhough we close the browser as we open them,
	// We close all pages first - reduces chance of browser.close() hanging
	const pages = await browser.pages();
	logger.info(`Closing ${pages.length} pages`);

	const pageClosePromises = pages.map((page) =>
		closePageSafely({ logger, page }),
	);
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
			error: getErrorMessage(error),
		});
		void browser.disconnect();
	}
}

export interface GetPageMetricsOptions {
	logger: GetScreenshotOptions["logger"];
	page: GetOrCreatePageReturnType;
}

/**
 * Monitors and reports page memory usage
 * @param {GetPageMetricsOptions} options - Options containing page and logger
 * @returns {Promise<object>} Memory metrics
 */
export async function getPageMetrics(options: GetPageMetricsOptions) {
	const { logger, page } = options;

	try {
		const metrics = await page.metrics();
		const heapUsed = metrics.JSHeapUsedSize ?? 0;
		const heapTotal = metrics.JSHeapTotalSize ?? 0;

		logger.debug("Page resource metrics", {
			documents: metrics.Documents,
			domNodes: metrics.Nodes,
			eventListeners: metrics.JSEventListeners,
			frames: metrics.Frames,
			heapTotalMB: Math.round(heapTotal / 1024 / 1024),
			heapUsagePercent: Math.round((heapUsed / Math.max(heapTotal, 1)) * 100),
			heapUsedMB: Math.round(heapUsed / 1024 / 1024),
			taskDurationMs: Math.round(metrics.TaskDuration ?? 0),
		});

		return {
			Frames: metrics.Frames ?? 0,
			JSEventListeners: metrics.JSEventListeners ?? 0,
			JSHeapTotalSize: heapTotal,
			JSHeapUsedSize: heapUsed,
			Nodes: metrics.Nodes ?? 0,
			TaskDuration: metrics.TaskDuration ?? 0,
		};
	} catch (error) {
		logger.warn("Failed to get page memory metrics", {
			error: getErrorMessage(error),
		});
		return {
			Frames: 0,
			JSEventListeners: 0,
			JSHeapTotalSize: 0,
			JSHeapUsedSize: 0,
			Nodes: 0,
			TaskDuration: 0,
		};
	}
}
