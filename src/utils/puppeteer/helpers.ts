import { PuppeteerBlocker } from "@ghostery/adblocker-puppeteer";
import fetch from "cross-fetch";
import type { Page } from "rebrowser-puppeteer-core";

import type { Logger } from "./logger";

export async function manualCookieBannerRemoval(
	page: Page,
	logger: Logger,
): Promise<void> {
	try {
		const removedCount = await page.evaluate(() => {
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
					// Ignore selector errors - can't log here as we're in browser context
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

			return removedCount;
		});

		if (removedCount > 0) {
			logger.info(
				`Manual cookie banner removal: ${removedCount} elements removed`,
			);
		} else {
			logger.debug("No cookie banner elements found to remove");
		}
	} catch (error) {
		logger.warn("Manual cookie banner removal failed", {
			error: (error as Error).message,
		});
	}
}

let blocker: null | PuppeteerBlocker = null;

export async function blockCookieBanners(
	page: Page,
	logger: Logger,
): Promise<void> {
	try {
		if (!blocker) {
			logger.info("Initializing cookie banner blocker...");
			blocker = await PuppeteerBlocker.fromLists(fetch, [
				// Cookie banners filter list from EasyList
				"https://secure.fanboy.co.nz/fanboy-cookiemonster.txt",
			]);
			logger.info("Cookie banner blocker initialized successfully");
		}

		// @ts-expect-error - Type mismatch between puppeteer and puppeteer-core
		await blocker.enableBlockingInPage(page);
		logger.info("Cookie banner blocking enabled for page");
	} catch (error) {
		logger.warn("Failed to initialize cookie blocker", {
			error: (error as Error).message,
		});

		// Continue without blocker - manual removal will still work
	}
}
