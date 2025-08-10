import { getErrorMessage } from "@/utils/errorUtils";
import type { GetScreenshotOptions } from "@/app/try/route";

import { setupBrowserPage } from "../browser-setup/setupBrowserPage";
import type { LaunchBrowserReturnType } from "../browser/launchBrowser";
import {
	closePageSafely,
	getOrCreatePage,
	type GetOrCreatePageReturnType,
} from "../browser/pageUtils";
import type { ProcessUrlReturnType } from "../request/processUrl";
import { captureScreenshot } from "./captureScreenshot";

interface GetVideoScreenshotHelperOptions {
	logger: GetVideoScreenshotOptions["logger"];
	page: Awaited<ReturnType<typeof getOrCreatePage>>;
	url: ProcessUrlReturnType;
}

/**
 * Capture a screenshot of a video by creating an HTML page with video element and canvas
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
				<head>
					<style>
						body {
							margin: 0;
							background: red;
							display: flex;
							justify-content: center;
							align-items: center;
							min-height: 100vh;
						}
						canvas {
							max-width: 100%;
							max-height: 100vh;
							border: 2px solid white;
						}
						video {
							display: none;
						}
					</style>
				</head>
				<body>
					<video id="video" muted playsinline preload="auto" crossorigin="anonymous">
						<source src="${url}" type="video/mp4" />
					</video>
					<canvas id="canvas" width="1280" height="720"></canvas>

					<script>
						const video = document.getElementById('video');
						const canvas = document.getElementById('canvas');
						const ctx = canvas.getContext('2d');

						let frameDrawn = false;

						function drawFrame() {
							if (video.videoWidth > 0 && video.videoHeight > 0) {
								// Resize canvas to match video
								canvas.width = video.videoWidth;
								canvas.height = video.videoHeight;

								// Draw the video frame to canvas
								ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
								frameDrawn = true;
								console.log('Frame drawn to canvas');
							}
						}

						video.addEventListener('loadeddata', () => {
							console.log('Video loaded, attempting to draw frame');
							setTimeout(drawFrame, 100);
						});

						video.addEventListener('canplay', () => {
							console.log('Video can play');
							video.play().then(() => {
								setTimeout(() => {
									drawFrame();
									video.pause();
								}, 500);
							}).catch(e => {
								console.log('Autoplay failed, trying manual frame draw');
								setTimeout(drawFrame, 1000);
							});
						});

						video.addEventListener('timeupdate', () => {
							if (!frameDrawn && video.currentTime > 0) {
								drawFrame();
							}
						});

						// Expose status
						window.isFrameDrawn = () => frameDrawn;
					</script>
				</body>
			</html>
			`;

		logger.debug("Setting up video capture HTML content");
		await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });

		// Wait for frame to be drawn to canvas
		logger.info("Waiting for video frame to be drawn to canvas...");

		await page
			.waitForFunction(
				() => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
					return (globalThis as any).isFrameDrawn?.();
				},
				{ timeout: 20_000 },
			)
			.catch(() => {
				logger.warn("Frame drawing timeout, checking canvas anyway...");
			});

		// Additional wait
		logger.debug("Applying additional wait for frame stabilization");
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Check if canvas has any content (not just black)
		logger.debug("Checking canvas for meaningful content");
		const hasCanvasContent = await page.evaluate(() => {
			const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
			const ctx = canvas.getContext("2d")!;
			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

			// Check for non-black pixels
			for (let i = 0; i < imageData.data.length; i += 4) {
				const r = imageData.data[i];
				const g = imageData.data[i + 1];
				const b = imageData.data[i + 2];
				if (r > 20 || g > 20 || b > 20) {
					return true;
				}
			}

			return false;
		});

		if (!hasCanvasContent) {
			logger.warn(
				"Canvas has no meaningful content - video may be black or failed to load",
			);
			return null;
		}

		logger.info("Canvas has valid content, taking screenshot");
		const canvasHandle = await page.$("canvas");
		if (!canvasHandle) {
			logger.error("Canvas element not found");
			return null;
		}

		const screenshot = await captureScreenshot({
			logger,
			target: canvasHandle,
			timerLabel: "Video canvas screenshot",
		});
		logger.info("Video screenshot captured successfully", {
			size: screenshot.length,
		});

		return Buffer.from(screenshot);
	} catch (error) {
		logger.error("Error capturing canvas screenshot", {
			error: getErrorMessage(error),
		});
		return null;
	}
}

interface GetVideoScreenshotOptions {
	browser: LaunchBrowserReturnType;
	logger: GetScreenshotOptions["logger"];
	url: ProcessUrlReturnType;
}

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
		await setupBrowserPage({ logger, page });

		const screenshot = await getVideoScreenshotHelper({ logger, page, url });

		if (screenshot) {
			return { metaData: null, screenshot };
		}

		logger.warn("Video screenshot failed, returning null for fallback");
		return null;
	} finally {
		if (page) await closePageSafely({ logger, page });
	}
}
