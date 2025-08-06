import { NextResponse, type NextRequest } from "next/server";
import getVideoId from "get-video-id";
import type {
	Browser,
	ElementHandle,
	JSHandle,
} from "rebrowser-puppeteer-core";

import {
	closeBrowser,
	launchBrowser,
} from "@/utils/puppeteer/browser-launcher";
import { setupBrowserPage } from "@/utils/puppeteer/browser-setup";
import { cloudflareChecker } from "@/utils/puppeteer/cloudflareChecker";
import { navigateWithFallback } from "@/utils/puppeteer/navigation";
import { parseRequestConfig } from "@/utils/puppeteer/request-parser";
import { getScreenshotInstagram } from "@/utils/puppeteer/site-handlers/instagram";
import { getMetadata } from "@/utils/puppeteer/site-handlers/metadata";
import { getScreenshotX } from "@/utils/puppeteer/site-handlers/twitter";
import { getScreenshotMp4 } from "@/utils/puppeteer/site-handlers/video";
import {
	INSTAGRAM,
	TWITTER,
	videoUrlRegex,
	X,
	YOUTUBE,
	YOUTUBE_THUMBNAIL_URL,
} from "@/utils/puppeteer/utils";

// https://nextjs.org/docs/app/api-reference/file-conventions/route#segment-config-options
export const maxDuration = 300;
// Disable caching for this route - https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
	const config = parseRequestConfig(request);

	if ("error" in config) {
		return NextResponse.json({ error: config.error }, { status: 400 });
	}

	const { fullPage, headless, imageIndex, logger, url } = config;
	let urlStr = url;

	let browser: Browser | null = null;

	try {
		logger.info("Starting screenshot capture", { fullPage, url });

		// Launch browser with environment-specific configuration
		const { browser: launchedBrowser, page } = await launchBrowser({
			headless,
			logger,
			timeout: 300_000, // Match maxDuration
		});
		browser = launchedBrowser;

		// Apply all browser setup configurations
		await setupBrowserPage(page, logger);

		// here we check if the url is mp4 or not, by it's content type
		const response = await fetch(urlStr);
		const contentType = response.headers.get("content-type");
		const urlHasVideoContentType = contentType?.startsWith("video/") ?? false;
		// here we check if the url is mp4 or not, by using regex
		const isVideoUrl = videoUrlRegex.test(urlStr);

		//  since we render the urls in the video tag and take the screenshot, we dont need to worry about the bot detection
		if (urlHasVideoContentType || isVideoUrl) {
			logger.info("Video URL detected", { contentType, isVideoUrl });

			try {
				const screenshot = await getScreenshotMp4(page, urlStr, logger);

				if (screenshot) {
					const headers = new Headers();
					headers.set("Content-Type", "application/json");

					return new NextResponse(
						JSON.stringify({ metaData: null, screenshot }),
						{ headers, status: 200 },
					);
				} else {
					// Video screenshot failed, fall back to regular page handling
					logger.warn(
						"Video screenshot failed, falling back to regular page screenshot",
					);
				}
			} catch (error) {
				logger.warn("Video screenshot error", {
					error: (error as Error).message,
				});
			}
		}

		let screenshot: Buffer | null | Uint8Array = null;
		let lastError: Error | null = null;
		let metaData: null | {
			description: null | string;
			favIcon: null | string;
			ogImage: null | string;
			title: null | string;
		} = null;

		for (let attempt = 1; attempt <= 2; attempt++) {
			try {
				logger.info(`Navigation attempt ${attempt}`, { url: urlStr });

				// here we check if the url is youtube or not, if the url has videoId we redirect to the YOUTUBE_THUMBNAIL_URL
				if (urlStr.includes(YOUTUBE)) {
					logger.info(
						"YouTube URL detected, fetching metadata and checking for videoId",
					);

					// here we use the getMetadata function to get the metadata of the video
					metaData = await getMetadata(page, urlStr, logger);

					const { id: videoId } = getVideoId(urlStr);
					if (videoId) {
						logger.info(
							"Video ID found, changing YOUTUBE URL to YOUTUBE_THUMBNAIL_URL",
						);
						urlStr = `${YOUTUBE_THUMBNAIL_URL}/${videoId}/maxresdefault.jpg`;
					}
				}

				const response = await navigateWithFallback(
					page,
					{ url: urlStr },
					logger,
				);

				if (!response?.ok()) {
					logger.warn(`Navigation attempt ${attempt} failed`, {
						status: response?.status(),
						statusText: response?.statusText(),
					});
				}

				await cloudflareChecker(page, logger);

				for (let shotTry = 1; shotTry <= 2; shotTry++) {
					try {
						// Check if a dialog exists before trying to close it
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

						logger.info(`Taking screenshot attempt ${shotTry}`);
						let screenshotTarget:
							| ElementHandle<HTMLElement>
							| JSHandle<HTMLDivElement | null>
							| null = null;

						//instagram.com
						// in instagram we directly take screenshot in the function itself, because for reel we get the og:image
						// to maintain the  same we are returning the buffer
						//for other we select the html elemnt and take screenshot of it
						if (urlStr.includes(INSTAGRAM)) {
							logger.info("Instagram URL detected");

							// here we use the getMetadata function to get the metadata for the post and reel
							metaData = await getMetadata(page, urlStr, logger);
							const buffer = await getScreenshotInstagram(
								page,
								urlStr,
								imageIndex ?? undefined,
								logger,
							);

							if (buffer) {
								const headers = new Headers();
								headers.set("Content-Type", "application/json");

								return new NextResponse(
									JSON.stringify({ metaData, screenshot: buffer }),
									{ headers, status: 200 },
								);
							}
						}

						// X/Twitter: Get specific tweet element
						if (urlStr.includes(X) || urlStr.includes(TWITTER)) {
							logger.info("X/Twitter URL detected");

							screenshotTarget = await getScreenshotX(page, urlStr, logger);
						}

						// YouTube: Get thumbnail image only if it is an video else take entire page screenshot
						if (urlStr.includes(YOUTUBE_THUMBNAIL_URL)) {
							logger.info("YouTube: Looking for thumbnail image for video");

							const img = await page.$("img");
							if (img) {
								logger.info("YouTube: Thumbnail image found for video");
								screenshotTarget = img;
							}
						}

						if (screenshotTarget) {
							logger.info("Screenshot target found");

							if ("screenshot" in screenshotTarget) {
								screenshot = await screenshotTarget.screenshot({
									type: "jpeg",
								});
							}
						} else {
							logger.info("No screenshot target found, taking page screenshot");
							screenshot = await page.screenshot({ fullPage, type: "jpeg" });
						}

						logger.info(
							`Screenshot captured successfully in ${shotTry} attempt`,
						);

						break; // Exit loop on success
					} catch (error) {
						if (
							error instanceof Error &&
							error.message.includes("frame was detached")
						) {
							break;
						}
						lastError = error as Error;
					}
				}

				if (screenshot) break;
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("frame was detached")
				) {
					lastError = error;
				} else {
					throw error;
				}
			}
		}

		if (!screenshot) {
			logger.error("Failed to capture screenshot", {
				details: lastError?.message,
			});
			return NextResponse.json(
				{ details: lastError?.message, error: "Failed to capture screenshot" },
				{ status: 500 },
			);
		}

		logger.logSummary(true, screenshot.length);

		const headers = new Headers();
		headers.set("Content-Type", "application/json");

		return new NextResponse(JSON.stringify({ metaData, screenshot }), {
			headers,
			status: 200,
		});
	} catch (error) {
		logger.error("Fatal error", { error: (error as Error).message });
		logger.logSummary(false);
		return NextResponse.json(
			{ error: "Internal Server Error" },
			{ status: 500 },
		);
	} finally {
		if (browser) await closeBrowser(browser, logger);
	}
}
