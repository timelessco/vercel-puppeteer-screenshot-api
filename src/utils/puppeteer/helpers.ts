import { PuppeteerBlocker } from "@cliqz/adblocker-puppeteer";
import { ElementHandle, type JSHandle, type Page } from "puppeteer-core";

export async function manualCookieBannerRemoval(page: Page): Promise<void> {
	try {
		await page.evaluate(() => {
			// window.scrollBy(0, 1920);
			const selectors = [
				// Generic cookie/consent selectors
				'[id*="cookie"]',
				'[class*="cookie"]',
				'[id*="consent"]',
				'[class*="consent"]',
				'[id*="gdpr"]',
				'[class*="gdpr"]',
				'[id*="privacy"]',
				'[class*="privacy"]',

				// Role-based selectors
				'div[role="dialog"]',
				'div[role="alertdialog"]',

				// Common class names
				".cookie-banner",
				".consent-banner",
				".privacy-banner",
				".gdpr-banner",
				"#cookie-notice",
				".cookie-notice",

				// Popular consent management platforms
				".onetrust-banner-sdk", // OneTrust
				".ot-sdk-container",
				"#didomi-host", // Didomi
				".didomi-consent-popup",
				".fc-consent-root", // Funding Choices
				".fc-dialog-container",
				".cmp-banner_banner", // General CMP
				".cookielaw-banner",
				".cookie-law-info-bar",

				// Additional patterns
				'[data-testid*="cookie"]',
				'[data-testid*="consent"]',
				'[aria-label*="cookie"]',
				'[aria-label*="consent"]',
				'[aria-describedby*="cookie"]',

				// Fixed position overlays that might be cookie banners
				'div[style*="position: fixed"][style*="z-index"]',

				// Text-based detection for stubborn banners
				'*[class*="accept-all"]',
				'*[class*="accept-cookies"]',
				'*[id*="accept-all"]',
				'*[id*="accept-cookies"]',
			];

			let removedCount = 0;

			selectors.forEach((selector) => {
				try {
					const elements = document.querySelectorAll(selector);
					elements.forEach((el) => {
						// Additional validation to avoid removing legitimate content
						if (el.parentNode) {
							const text = el.textContent?.toLowerCase() ?? "";
							const hasKeywords = [
								"cookie",
								"consent",
								"privacy",
								"gdpr",
								"accept",
								"reject",
								"manage preferences",
							].some((keyword) => text.includes(keyword));

							// Remove if it contains cookie-related keywords or matches specific selectors
							if (
								hasKeywords ||
								selector.includes("cookie") ||
								selector.includes("consent") ||
								selector.includes("onetrust") ||
								selector.includes("didomi")
							) {
								el.remove();
								removedCount++;
							}
						}
					});
				} catch (error) {
					// Ignore selector errors
					console.debug(
						`Error with selector "${selector}":`,
						(error as Error).message,
					);
				}
			});

			// Also look for and remove backdrop/overlay elements that might be related to cookie banners
			const overlays = document.querySelectorAll(
				'div[style*="position: fixed"], div[style*="position: absolute"]',
			);
			overlays.forEach((overlay) => {
				const style = globalThis.getComputedStyle(overlay);
				const zIndex = Number.parseInt(style.zIndex) || 0;
				const opacity = Number.parseFloat(style.opacity) || 1;

				// Remove high z-index, semi-transparent overlays that might be cookie banner backdrops
				if (zIndex > 1000 && opacity < 1 && opacity > 0) {
					const text = overlay.textContent?.toLowerCase() ?? "";
					if (
						text.includes("cookie") ||
						text.includes("consent") ||
						text.includes("privacy")
					) {
						overlay.remove();
						removedCount++;
					}
				}
			});

			console.log(
				`Manual cookie banner removal: ${removedCount} elements removed`,
			);
			return removedCount;
		});
	} catch (error) {
		console.warn(
			"Manual cookie banner removal failed:",
			(error as Error).message,
		);
	}
}

let blocker: null | PuppeteerBlocker = null;

export async function blockCookieBanners(page: Page): Promise<void> {
	try {
		if (!blocker) {
			console.log("Initializing cookie banner blocker...");
			blocker = await PuppeteerBlocker.fromLists(globalThis.fetch, [
				// Cookie banners filter list from EasyList
				"https://secure.fanboy.co.nz/fanboy-cookiemonster.txt",
			]);
			console.log("Cookie banner blocker initialized successfully");
		}

		// @ts-expect-error - Type mismatch between puppeteer and puppeteer-core
		await blocker.enableBlockingInPage(page);
		console.log("Cookie banner blocking enabled for page");
	} catch (error) {
		console.warn(
			"Failed to initialize cookie blocker:",
			(error as Error).message,
		);
		// Continue without blocker - manual removal will still work
	}
}

// Screenshot function for Instagram
// It returns the array buffer
export async function getScreenshotInstagram(
	page: Page,
	urlStr: string,
	imageIndex?: string,
): Promise<Buffer> {
	let buffer: Buffer | null = null;
	const ogImage = await page.evaluate(() => {
		const meta = document.querySelector('meta[property="og:image"]');
		return meta ? meta.getAttribute("content") : null;
	});

	if (ogImage) {
		console.log("Found og:image:", ogImage);
		const imageRes = await globalThis.fetch(ogImage);
		const arrayBuffer = await imageRes.arrayBuffer();
		buffer = Buffer.from(arrayBuffer);
	} else {
		console.warn("No og:image found — taking fallback screenshot");
		const screenshot = await page.screenshot({ type: "png" });
		buffer = Buffer.from(screenshot);
		const headers = new Headers();
		headers.set("Content-Type", "image/png");
		headers.set("Content-Length", buffer.length.toString());
		return buffer;
	}

	if (urlStr.includes("/reel/")) {
		return buffer;
	}

	if (urlStr.includes("/p/")) {
		const ariaLabel = "Next";
		const index = imageIndex ? Number.parseInt(imageIndex) : null;

		if (index && index > 1) {
			for (let i = 0; i < index; i++) {
				await page.waitForSelector(`[aria-label="${ariaLabel}"]`, {
					visible: true,
				});
				await page.click(`[aria-label="${ariaLabel}"]`);
				await new Promise((res) => setTimeout(res, 500));
			}
		}

		const divs = await page.$$("article > div");
		if (divs.length > 0) {
			const imgs = await divs[1].$$("img");
			console.log("Found images:", imgs.length);

			const srcHandle =
				await imgs[index && index > 1 ? 1 : 0].getProperty("src");
			const src = await srcHandle.jsonValue();

			const imageRes = await fetch(src);
			const arrayBuffer = await imageRes.arrayBuffer();
			buffer = Buffer.from(arrayBuffer);
		}
	}

	return buffer;
}

// Screenshot function for X and Twitter
// It returns the html element the screenshot should be taken -> (screenshotTarget)
export async function getScreenshotX(
	page: Page,
	urlStr: string,
): Promise<
	ElementHandle<HTMLElement> | JSHandle<HTMLDivElement | null> | null
> {
	if (urlStr.includes("/status/")) {
		return await page.$("article");
	}

	return await page.evaluateHandle(() => {
		const main = document.querySelector("main");
		if (!main) return null;

		const divs = main.querySelectorAll("div");
		for (const div of divs) {
			const firstChild = div.firstElementChild;
			if (
				firstChild &&
				firstChild.tagName === "A"
				// && firstChild?.getAttribute('aria-hidden') === 'true'
			) {
				return div;
			}
		}
		return null;
	});
}

//in this function we render the urls in the video tag and take the screenshot
export async function getScreenshotMp4(
	page: Page,
	url: string,
): Promise<Buffer | null> {
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

		await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });

		// Wait for frame to be drawn to canvas
		console.log("Waiting for frame to be drawn...");
		await page
			.waitForFunction(
				() => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
					return (globalThis as any).isFrameDrawn?.();
				},
				{ timeout: 20_000 },
			)
			.catch(() => {
				console.log("Frame drawing timeout, checking canvas anyway...");
			});

		// Additional wait
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Check if canvas has any content (not just black)
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
			console.log("Canvas has no meaningful content");
			return null;
		}

		console.log("Taking screenshot of canvas...");
		const canvasHandle = await page.$("canvas");
		const screenshot = await canvasHandle!.screenshot({ type: "png" });

		console.log("Canvas screenshot captured successfully.");
		return Buffer.from(screenshot);
	} catch (error) {
		console.error(
			"Error capturing canvas screenshot:",
			(error as Error).message,
		);
		return null;
	}
}

//here in this function we get the metadata for the following websites
// instagram, youtube
// we fetch the metadata here because the ogs fails in the recollect repo
export async function getMetadata(
	page: Page,
	urlStr: string,
): Promise<{
	description: null | string;
	favIcon: null | string;
	ogImage: null | string;
	title: null | string;
}> {
	await page.goto(urlStr, {
		timeout: 300_000,
		waitUntil: "networkidle2",
	});

	const metadata = await page.evaluate(() => {
		// eslint-disable-next-line unicorn/consistent-function-scoping
		const getMetaContent = (selector: string): null | string => {
			const el = document.querySelector(selector);
			return el ? el.getAttribute("content") : null;
		};

		const ogImage =
			getMetaContent('meta[property="og:image"]') ??
			getMetaContent('link[rel="image_src"]');

		const title = getMetaContent('meta[property="og:title"]') ?? document.title;

		const description =
			getMetaContent('meta[property="og:description"]') ??
			getMetaContent('meta[name="description"]');

		const favIcon =
			document
				.querySelector<HTMLLinkElement>('link[rel="icon"]')
				?.getAttribute("href") ??
			document
				.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]')
				?.getAttribute("href") ??
			null;

		return {
			description,
			favIcon,
			ogImage,
			title,
		};
	});

	return metadata;
}
