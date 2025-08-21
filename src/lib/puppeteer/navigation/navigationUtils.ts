import type { HTTPResponse } from "rebrowser-puppeteer-core";

import type { GetOrCreatePageReturnType } from "@/lib/puppeteer/browser/pageUtils";
import { getErrorMessage } from "@/utils/errorUtils";
import type { GetScreenshotOptions } from "@/app/try/route";

interface GotoPageOptions {
	fontTimeout?: number;
	logger: GetScreenshotOptions["logger"];
	navigationTimeout?: number;
	page: GetOrCreatePageReturnType;
	url: GetScreenshotOptions["url"];
}

/**
 * Navigates to a page with appropriate timeout and wait conditions based on URL
 * Uses networkidle0 for direct image URLs for faster loading, networkidle2 for regular pages
 * @param {GotoPageOptions} options - Options containing page, url, logger, and optional timeouts
 * @returns {Promise<HTTPResponse | null>} Response object from navigation or null
 */
export async function gotoPage(
	options: GotoPageOptions,
): Promise<HTTPResponse | null> {
	const {
		fontTimeout = 30_000,
		logger,
		navigationTimeout = 30_000,
		page,
		url,
	} = options;
	const navTimer = logger.time("Page navigation");

	try {
		const isDirectImage = /\.(?:jpg|jpeg|png|gif|webp|svg)$/i.test(url);
		logger.info("Navigating to page", { isDirectImage, url });

		const response = await page.goto(url, {
			timeout: navigationTimeout,
			waitUntil: isDirectImage
				? ["networkidle0"]
				: ["domcontentloaded", "networkidle2"],
		});

		// For non-image pages, wait for fonts to load
		if (!isDirectImage) {
			try {
				logger.debug("Waiting for fonts to load");
				await page.waitForFunction(() => document.fonts.ready, {
					timeout: fontTimeout,
				});
			} catch {
				logger.warn("Fonts did not load within timeout, continuing anyway");
				// Continue with screenshot instead of failing
			}
		}

		navTimer();
		logger.info("Navigation completed successfully");
		return response;
	} catch (error) {
		navTimer();
		logger.error("Navigation failed", { error: getErrorMessage(error) });
		throw error;
	}
}

export interface HandleDialogsOptions {
	logger: GetScreenshotOptions["logger"];
	page: GetOrCreatePageReturnType;
}

/**
 * Handle dialogs on the page by attempting to close them with Escape key
 * @param {HandleDialogsOptions} options - Options containing page and logger
 * @returns {Promise<void>}
 */
export async function handleDialogs(
	options: HandleDialogsOptions,
): Promise<void> {
	const { logger, page } = options;
	try {
		const dialogElement = await page.$('div[role="dialog"]');
		if (dialogElement) {
			logger.info("Dialog detected, attempting to close");
			await page.keyboard.press("Escape");

			try {
				await page.waitForSelector('div[role="dialog"]', {
					hidden: true,
					timeout: 2000,
				});
				logger.info("Dialog closed");
			} catch {
				logger.warn(
					"[role='dialog'] did not close after Escape — continuing anyway",
				);
			}
		} else {
			logger.debug("No dialog detected, skipping dialog handling");
		}
	} catch (error) {
		logger.debug("Skipping dialog check due to page state", {
			error,
		});
	}
}
