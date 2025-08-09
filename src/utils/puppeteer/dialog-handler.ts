import type { Page } from "rebrowser-puppeteer-core";

import type { Logger } from "./logger";

/**
 * Handle dialogs on the page by attempting to close them with Escape key
 * @param {Page} page - The Puppeteer page instance
 * @param {Logger} logger - Logger instance for debugging
 * @returns {Promise<void>}
 */
export async function handleDialogs(page: Page, logger: Logger): Promise<void> {
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
