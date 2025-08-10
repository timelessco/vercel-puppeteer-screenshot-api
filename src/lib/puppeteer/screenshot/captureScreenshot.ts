import type { ElementHandle, Page } from "rebrowser-puppeteer-core";

import { getErrorMessage } from "@/utils/errorUtils";
import type { GetScreenshotOptions } from "@/app/try/route";

export interface CaptureScreenshotOptions {
	logger: GetScreenshotOptions["logger"];
	screenshotOptions?: Parameters<Page["screenshot"]>[0];
	target: ElementHandle | Page;
	timerLabel?: string;
}

/**
 * Universal screenshot function that handles both page and element screenshots
 * with multiple fallback levels to ensure we always return something
 * @param {CaptureScreenshotOptions} options - Options object containing target, screenshot options, logger, and optional timer label
 * @returns {Promise<Buffer>} Screenshot buffer (always returns something)
 */
export async function captureScreenshot(
	options: CaptureScreenshotOptions,
): Promise<Buffer> {
	const { logger, screenshotOptions = {}, target, timerLabel } = options;

	// Start timer if label provided
	const timer = timerLabel ? logger.time(timerLabel) : null;

	try {
		// Try normal screenshot
		logger.debug(`Attempting to take screenshot`);
		const result = await target.screenshot({
			optimizeForSpeed: true,
			type: "jpeg",
			...screenshotOptions,
		});
		timer?.(); // Stop timer on success

		return Buffer.from(result);
	} catch (error) {
		logger.warn(`Screenshot failed, trying simplified screenshot as fallback`, {
			error: getErrorMessage(error),
		});

		// Simplified options
		try {
			logger.debug("Trying simplified screenshot options");
			const result = await target.screenshot({
				...screenshotOptions,
				fullPage: false,
				optimizeForSpeed: true,
				quality: 70,
				type: "jpeg",
			});
			timer?.(); // Stop timer

			return Buffer.from(result);
		} catch (error) {
			logger.warn(`Simplified screenshot failed`, {
				error: getErrorMessage(error),
			});
		}

		// Try CDP for pages only if exists
		if ("createCDPSession" in target) {
			try {
				logger.debug("Attempting CDP screenshot");
				const client = await target.createCDPSession();
				const { data } = await client.send("Page.captureScreenshot", {
					format: "jpeg",
					optimizeForSpeed: true,
					quality: 60,
				});
				await client.detach();
				timer?.(); // Stop timer
				return Buffer.from(data, "base64");
			} catch (error) {
				logger.error("CDP screenshot also failed", {
					error: getErrorMessage(error),
				});
			}
		}

		logger.error("All screenshot methods failed, returning fallback image");
		timer?.(); // Stop timer even for fallback
		throw error;
	}
}
