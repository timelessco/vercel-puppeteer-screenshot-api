import type { ElementHandle, Page } from "rebrowser-puppeteer-core";

import type { Logger } from "./logger";

type ScreenshotOptions = Parameters<Page["screenshot"]>[0];

/**
 * Universal screenshot function that handles both page and element screenshots
 * with multiple fallback levels to ensure we always return something
 * @param {ElementHandle | Page} target - The page or element to screenshot
 * @param {ScreenshotOptions} options - Screenshot options
 * @param {Logger} logger - Logger instance for debugging
 * @param {string} timerLabel - Optional timer label for performance tracking
 * @returns {Promise<Buffer>} Screenshot buffer (always returns something)
 */
export async function captureScreenshot(
	target: ElementHandle | Page,
	options: ScreenshotOptions = {},
	logger: Logger,
	timerLabel?: string, // Optional timer label for performance tracking
): Promise<Buffer> {
	const isPage = "screenshot" in target && "createCDPSession" in target;
	const targetName = isPage ? "page" : "element";

	// Start timer if label provided
	const timer = timerLabel ? logger.time(timerLabel) : null;

	try {
		// Level 1: Try normal screenshot
		logger.debug(`Attempting ${targetName} screenshot`);
		const result = await target.screenshot(options);
		timer?.(); // Stop timer on success

		return Buffer.from(result);
	} catch (error) {
		logger.warn(`${targetName} screenshot failed, trying fallback`, {
			error: (error as Error).message,
		});

		// Level 2: Simplified options
		try {
			logger.debug("Trying simplified screenshot options");
			const result = await target.screenshot({
				...options,
				fullPage: false,
				optimizeForSpeed: true,
				quality: 70,
				type: "jpeg",
			});
			timer?.(); // Stop timer

			return Buffer.from(result);
		} catch {
			// Continue to next fallback
		}

		// Level 3: Try CDP for pages only
		if (isPage) {
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
					error: (error as Error).message,
				});
			}
		}

		// Level 4: Return minimal fallback image (1x1 red pixel JPEG)
		logger.error("All screenshot methods failed, returning fallback image");
		timer?.(); // Stop timer even for fallback
		return Buffer.from(
			"/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=",
			"base64",
		);
	}
}
