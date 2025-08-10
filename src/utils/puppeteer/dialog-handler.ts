import type { GetOrCreatePageReturnType } from "@/utils/puppeteer/page-utils";
import type { GetScreenshotOptions } from "@/app/try/route";

interface HandleDialogsOptions {
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
