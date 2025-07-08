import { PuppeteerBlocker } from "@cliqz/adblocker-puppeteer";
import type { ElementHandle, Page } from "puppeteer-core";

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
): Promise<ElementHandle | null> {
	if (urlStr.includes("/status/")) {
		return await page.$("article");
	} else {
		const handle = await page.evaluateHandle(() => {
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

		// Try to convert to element handle
		const element = handle.asElement();
		if (!element) {
			await handle.dispose();
			return null;
		}

		return element as ElementHandle;
	}
}
