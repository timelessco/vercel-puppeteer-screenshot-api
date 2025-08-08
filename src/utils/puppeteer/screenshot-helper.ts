import type { Page, ScreenshotOptions } from "rebrowser-puppeteer-core";

import { getErrorMessage } from "@/utils/errorUtils";

import type { Logger } from "./logger";

export interface ScreenshotWithTimeoutOptions extends ScreenshotOptions {
	timeout?: number;
}

function createTimeoutPromise(ms: number): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => {
			reject(new Error(`Screenshot timeout after ${ms}ms`));
		}, ms);
	});
}

/**
 * Takes a screenshot with timeout protection
 * @param {Page} page - The Puppeteer page instance
 * @param {ScreenshotWithTimeoutOptions} options - Screenshot options including timeout
 * @param {Logger} logger - Logger for debugging
 * @returns {Promise<Buffer | Uint8Array>} Screenshot buffer
 */
async function screenshotWithTimeout(
	page: Page,
	options: ScreenshotWithTimeoutOptions,
	logger: Logger,
): Promise<Buffer | Uint8Array> {
	const { timeout = 10_000, ...screenshotOptions } = options;

	const timer = logger.time(`Screenshot with timeout (${timeout}ms)`);

	try {
		const screenshot = await Promise.race([
			page.screenshot(screenshotOptions),
			createTimeoutPromise(timeout),
		]);

		timer();
		return screenshot;
	} catch (error) {
		timer();
		throw error;
	}
}

/**
 * Attempts to clean up the page to reduce memory usage before screenshot
 * @param {Page} page - The Puppeteer page instance
 * @param {Logger} logger - Logger for debugging
 */
async function cleanupPageForScreenshot(
	page: Page,
	logger: Logger,
): Promise<void> {
	try {
		logger.debug("Cleaning up page for screenshot");

		// Stop any ongoing media/animations
		await page.evaluate(() => {
			// Pause all videos
			const videos = document.querySelectorAll("video");
			videos.forEach((video) => {
				video.pause();
				video.src = "";
				video.load();
			});

			// Stop all animations
			const style = document.createElement("style");
			style.textContent =
				"*, *::before, *::after { animation-play-state: paused !important; }";
			document.head.append(style);

			// Remove heavy iframes if they're not visible
			const iframes = document.querySelectorAll("iframe");
			iframes.forEach((iframe) => {
				const rect = iframe.getBoundingClientRect();
				if (rect.bottom < 0 || rect.top > window.innerHeight) {
					iframe.src = "about:blank";
				}
			});

			// Force garbage collection if available
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			if (typeof (globalThis as any).gc === "function") {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				(globalThis as any).gc();
			}
		});

		logger.debug("Page cleanup completed");
	} catch (error) {
		logger.warn("Page cleanup failed, continuing anyway", {
			error: getErrorMessage(error),
		});
	}
}

/**
 * Takes a screenshot with progressive fallback strategy
 * Tries different quality levels and options if the initial attempt fails
 * @param {Page} page - The Puppeteer page instance
 * @param {ScreenshotWithTimeoutOptions} options - Initial screenshot options
 * @param {Logger} logger - Logger for debugging
 * @returns {Promise<Buffer | Uint8Array>} Screenshot buffer
 */
export async function takeScreenshotWithFallback(
	page: Page,
	options: ScreenshotWithTimeoutOptions,
	logger: Logger,
): Promise<Buffer | Uint8Array> {
	const strategies = [
		// Strategy 1: Original options with timeout
		{
			name: "full quality",
			options: {
				...options,
				timeout: options.timeout ?? 10_000,
			},
		},
		// Strategy 2: Reduce quality and disable fullPage
		{
			name: "reduced quality",
			options: {
				fullPage: false,
				optimizeForSpeed: true,
				quality: 60,
				timeout: 8000,
				type: "jpeg" as const,
			},
		},
		// Strategy 3: Minimal screenshot with cleanup
		{
			cleanup: true,
			name: "minimal with cleanup",
			options: {
				fullPage: false,
				optimizeForSpeed: true,
				quality: 40,
				timeout: 5000,
				type: "jpeg" as const,
			},
		},
		// Strategy 4: Emergency viewport only
		{
			cleanup: true,
			name: "emergency viewport",
			options: {
				clip: {
					height: 720,
					width: 1280,
					x: 0,
					y: 0,
				},
				fullPage: false,
				optimizeForSpeed: true,
				quality: 30,
				timeout: 3000,
				type: "jpeg" as const,
			},
		},
	];

	let lastError: Error | undefined;

	for (const strategy of strategies) {
		try {
			logger.info(`Attempting screenshot with ${strategy.name} strategy`);

			// Perform cleanup if requested
			if (strategy.cleanup) {
				await cleanupPageForScreenshot(page, logger);
			}

			const screenshot = await screenshotWithTimeout(
				page,
				strategy.options,
				logger,
			);

			logger.info(`Screenshot successful with ${strategy.name} strategy`, {
				size: screenshot.byteLength,
			});

			return screenshot;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			logger.warn(`Screenshot failed with ${strategy.name} strategy`, {
				error: getErrorMessage(lastError),
			});

			// Don't continue if it's not a timeout or target closed error
			if (
				!lastError.message.includes("timeout") &&
				!lastError.message.includes("Target closed") &&
				!lastError.message.includes("Protocol error")
			) {
				throw lastError;
			}
		}
	}

	// All strategies failed
	throw lastError ?? new Error("All screenshot strategies failed");
}
