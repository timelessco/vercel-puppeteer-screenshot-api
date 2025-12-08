import { getErrorMessage } from "@/utils/errorUtils";
import type { GetScreenshotOptions, ScreenshotResult } from "@/app/try/route";

import { setupBrowserPage } from "../browser-setup/setupBrowserPage";
import {
	closePageSafely,
	getOrCreatePage,
	type GetOrCreatePageReturnType,
} from "../browser/pageUtils";
import { CDN_INSTAGRAM, INSTAGRAM } from "../core/constants";
import type { WithBrowserOptions } from "../core/withBrowser";
import { captureScreenshot } from "./captureScreenshot";

type FetchImageDirectlyOptions = GetScreenshotOptions;

/**
 * Fetch image directly using Node.js fetch to bypass CORS restrictions
 * @param {FetchImageDirectlyOptions} options - Options containing url and logger
 * @returns {Promise<Buffer>} Image buffer
 */
export async function fetchImageDirectly(
	options: FetchImageDirectlyOptions,
): Promise<Buffer> {
	const { logger, url } = options;
	logger.info("Fetching image directly via server-side fetch", { url });

	const isInstagramCdn = url.includes(INSTAGRAM) || url.includes(CDN_INSTAGRAM);

	// Determine appropriate headers based on CDN
	const headers: HeadersInit = {
		Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
		"Accept-Encoding": "gzip, deflate, br",
		"Accept-Language": "en-US,en;q=0.9",
		"Cache-Control": "no-cache",
		Referer: isInstagramCdn
			? "https://www.instagram.com/"
			: new URL(url).origin,
		"User-Agent":
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	};

	try {
		const response = await fetch(url, {
			headers,
			signal: AbortSignal.timeout(10_000), // 10 second timeout
		});

		if (!response.ok) {
			throw new Error(
				`HTTP error! status: ${response.status} ${response.statusText}`,
			);
		}

		// Check if response is actually an image
		const contentType = response.headers.get("content-type");
		if (!contentType?.startsWith("image/")) {
			throw new Error(`Not an image: ${contentType}`);
		}

		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		logger.info("Image fetched successfully", {
			contentType,
			size: buffer.length,
		});

		return buffer;
	} catch (error) {
		logger.error("Failed to fetch image directly", {
			error: getErrorMessage(error),
			url,
		});
		throw error;
	}
}

interface GetImageScreenshotHelperOptions {
	logger: GetImageScreenshotOptions["logger"];
	page: GetOrCreatePageReturnType;
	url: GetImageScreenshotOptions["url"];
}

/**
 * Capture a screenshot of an image by creating an HTML page with img element (fallback method)
 * @param {GetImageScreenshotHelperOptions} options - Options containing page, url, and logger
 * @returns {Promise<Buffer | null>} Screenshot buffer or null if capture fails
 */
async function getImageScreenshotHelper(
	options: GetImageScreenshotHelperOptions,
): Promise<Buffer | null> {
	const { logger, page, url } = options;
	logger.info("Processing image screenshot with Puppeteer", { url });

	try {
		const htmlContent = `
			<!DOCTYPE html>
			<html>
				<body style="margin:0;background:#f0f0f0;display:flex;justify-content:center;align-items:center;min-height:100vh">
					<img id="i" crossorigin="anonymous" style="max-width:100%;max-height:100vh;display:block;object-fit:contain">
					<script>
						const i = document.getElementById('i');
						i.src = '${url}';
						i.addEventListener('load', () => {
							if (i.naturalWidth > 0) {
								window.imageReady = true;
							}
						});
						i.addEventListener('error', () => window.imageError = true);
					</script>
				</body>
			</html>`;

		logger.debug("Setting up image HTML content");
		await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });

		// Wait for image ready or error (5 second timeout)
		logger.info("Waiting for image to load...");
		await page.waitForFunction(
			() => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
				return (globalThis as any).imageReady ?? (globalThis as any).imageError;
			},
			{ timeout: 5000 },
		);

		// Check if image loaded successfully
		const isReady = await page.evaluate(() => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			return (globalThis as any).imageReady === true;
		});

		if (!isReady) {
			logger.warn("Image failed to load or encountered an error");
			return null;
		}

		// Get image element using modern locator API for better reliability
		// Locators auto-wait and retry, then we get the handle for screenshot
		try {
			const imageElement = await page
				.locator("img")
				.setTimeout(1000)
				.waitHandle();

			// Use captureScreenshot for built-in fallbacks
			logger.info("Taking image element screenshot");
			const screenshot = await captureScreenshot({
				logger,
				target: imageElement,
				timerLabel: "Image element screenshot",
			});

			logger.info("Image screenshot captured successfully", {
				size: screenshot.length,
			});

			return screenshot;
		} catch (error) {
			logger.error("Image element not found or screenshot failed", {
				error: getErrorMessage(error),
			});
			return null;
		}
	} catch (error) {
		logger.error("Error capturing image screenshot", {
			error: getErrorMessage(error),
		});
		return null;
	}
}

type GetImageScreenshotOptions = WithBrowserOptions;

/**
 * Handle image URL detection and screenshot capture
 * @param {GetImageScreenshotOptions} options - Options containing page, url, and logger
 * @returns {Promise<ScreenshotResult | null>} Screenshot result or null if not an image/failed
 */
export async function getImageScreenshot(
	options: GetImageScreenshotOptions,
): Promise<null | ScreenshotResult> {
	const { browser, logger, url } = options;

	logger.info("Processing image screenshot", { url });

	let page: GetOrCreatePageReturnType | null = null;

	try {
		// Page navigation and setup
		page = await getOrCreatePage({ browser, logger });
		await setupBrowserPage({ enableAdBlocker: false, logger, page });

		const screenshot = await getImageScreenshotHelper({
			logger,
			page,
			url,
		});

		if (screenshot)
			return {
				allImages: [],
				metaData: null,
				screenshot,
				videoUrl: null,
			};

		logger.warn("Image screenshot failed, returning null for fallback");
		return null;
	} catch (error) {
		logger.error("Error in getImageScreenshot Puppeteer fallback", {
			error: getErrorMessage(error),
		});
		return null;
	} finally {
		if (page) await closePageSafely({ logger, page });
	}
}
