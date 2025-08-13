import { getErrorMessage } from "@/utils/errorUtils";

import { setupBrowserPage } from "../browser-setup/setupBrowserPage";
import {
	closePageSafely,
	getOrCreatePage,
	type GetOrCreatePageReturnType,
} from "../browser/pageUtils";
import type { WithBrowserOptions } from "../core/withBrowser";
import { captureScreenshot } from "./captureScreenshot";

interface GetVideoScreenshotHelperOptions {
	logger: GetVideoScreenshotOptions["logger"];
	page: GetOrCreatePageReturnType;
	url: GetVideoScreenshotOptions["url"];
}

/**
 * Capture a screenshot of a video by creating an HTML page with video element
 * @param {GetVideoScreenshotHelperOptions} options - Options containing page, url, and logger
 * @returns {Promise<Buffer | null>} Screenshot buffer or null if capture fails
 */
async function getVideoScreenshotHelper(
	options: GetVideoScreenshotHelperOptions,
): Promise<Buffer | null> {
	const { logger, page, url } = options;
	logger.info("Processing video screenshot", { url });

	try {
		const htmlContent = `
			<!DOCTYPE html>
			<html>
				<body style="margin:0;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh">
					<video id="v" autoplay muted crossorigin="anonymous" style="max-width:100%;max-height:100vh;display:block"></video>
					<script>
						const v = document.getElementById('v');
						v.src = '${url}';
						v.addEventListener('loadeddata', () => {
							if (v.videoWidth > 0) {
								v.pause();
								window.videoReady = true;
							}
						});
						v.addEventListener('error', () => window.videoError = true);
					</script>
				</body>
			</html>`;

		logger.debug("Setting up video HTML content");
		await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });

		// Wait for video ready or error (5 second timeout)
		logger.info("Waiting for video to load...");
		await page.waitForFunction(
			() => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
				return (globalThis as any).videoReady ?? (globalThis as any).videoError;
			},
			{ timeout: 5000 },
		);

		// Check if video loaded successfully
		const isReady = await page.evaluate(() => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			return (globalThis as any).videoReady === true;
		});

		if (!isReady) {
			logger.warn("Video failed to load or encountered an error");
			return null;
		}

		// Get video element using modern locator API for better reliability
		// Locators auto-wait and retry, then we get the handle for screenshot
		try {
			const videoElement = await page
				.locator("video")
				.setTimeout(1000)
				.waitHandle();

			// Use captureScreenshot for built-in fallbacks
			logger.info("Taking video element screenshot");
			const screenshot = await captureScreenshot({
				logger,
				target: videoElement,
				timerLabel: "Video element screenshot",
			});

			logger.info("Video screenshot captured successfully", {
				size: screenshot.length,
			});

			return screenshot;
		} catch (error) {
			logger.error("Video element not found or screenshot failed", {
				error: getErrorMessage(error),
			});
			return null;
		}
	} catch (error) {
		logger.error("Error capturing video screenshot", {
			error: getErrorMessage(error),
		});
		return null;
	}
}

type GetVideoScreenshotOptions = WithBrowserOptions;

/**
 * Handle video URL detection and screenshot capture
 * @param {GetVideoScreenshotOptions} options - Options containing page, url, and logger
 * @returns {Promise<{ metaData: null; screenshot: Buffer } | null>} Screenshot result or null if not a video/failed
 */
export async function getVideoScreenshot(
	options: GetVideoScreenshotOptions,
): Promise<null | { metaData: null; screenshot: Buffer }> {
	const { browser, logger, url } = options;

	logger.info("Processing video screenshot", { url });
	let page: GetOrCreatePageReturnType | null = null;

	try {
		// Page navigation and setup
		page = await getOrCreatePage({ browser, logger });
		await setupBrowserPage({ enableAdBlocker: false, logger, page });

		const screenshot = await getVideoScreenshotHelper({ logger, page, url });

		if (screenshot) {
			return { metaData: null, screenshot };
		}

		logger.warn("Video screenshot failed, returning null for fallback");
		return null;
	} catch (error) {
		logger.error("Error in getVideoScreenshot", {
			error: getErrorMessage(error),
		});
		return null;
	} finally {
		if (page) await closePageSafely({ logger, page });
	}
}
