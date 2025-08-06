import type { Page } from "rebrowser-puppeteer-core";

import type { Logger } from "../logger";

const AUTOCONSENT_CDN_URL =
	"https://cdn.jsdelivr.net/npm/@duckduckgo/autoconsent@14.10.1/dist/autoconsent.playwright.js";

// Cache the script in memory to avoid repeated CDN fetches
let cachedAutoconsentScript: null | string = null;

/**
 * Interactive Cookie Consent Handling via @duckduckgo/autoconsent
 *
 * Automatically handles consent dialogs from 20+ major CMPs:
 * - OneTrust - Major enterprise CMP used by many large sites
 * - TrustArc (formerly TRUSTe) - Privacy compliance platform
 * - Didomi - GDPR/CCPA consent management
 * - Sourcepoint - Message and consent platform
 * - CybotCookiebot - Popular cookie consent solution
 * - Evidon - Privacy compliance tools
 * - Civic - Cookie control platform
 * - Termly - Privacy policy and consent management
 * - Admiral - Visitor relationship management
 * - Sirdata - CMP for publishers
 * - Ketch - Privacy operations platform
 * - Tealium - Universal consent and preferences
 * - TermsFeed - Privacy policy generator with consent tools
 * - Cookie-law-info - WordPress GDPR plugin
 * - EU Cookie Compliance - Another WordPress solution
 * - Tagcommander - Privacy and consent management
 * - Future CMP - Used by Future Publishing sites
 * - WPCC (WordPress Cookie Consent)
 * - Cookie-Script - Cookie consent service
 * - Webflow - Built-in Webflow cookie consent
 * - Clinch - Consent management platform
 * - FastCMP - Performance-focused CMP
 *
 * Also includes:
 * - Cosmetic filters from EasyList Cookie for hiding banners
 * - Site-specific rules for custom implementations
 * - Automatic opt-out selection where possible
 * - Support for both "reject all" and "accept necessary only" patterns
 *
 * How it works:
 * - Fetches autoconsent script from CDN (cached in memory)
 * - Injects JavaScript rules that programmatically navigate consent popups
 * - Attempts to click "reject all" or minimal consent options
 * - Falls back to hiding banners if interaction fails
 * - Runs on every page load to handle dynamic consent popups
 * @param {Page} page - The Puppeteer page instance
 * @param {Logger} logger - Logger instance for debugging
 */
export async function setupCookieConsent(
	page: Page,
	logger: Logger,
): Promise<void> {
	try {
		// Use cached script if available, otherwise fetch from CDN
		if (!cachedAutoconsentScript) {
			const response = await fetch(AUTOCONSENT_CDN_URL);

			if (!response.ok) {
				throw new Error(
					`Failed to fetch autoconsent script: ${response.status} ${response.statusText}`,
				);
			}

			cachedAutoconsentScript = await response.text();
			logger.info("Fetched autoconsent script from CDN");
		}

		// Inject the script to run on every page load
		// This handles consent popups that appear after navigation
		await page.evaluateOnNewDocument(cachedAutoconsentScript);

		logger.info("Cookie consent handler (autoconsent) injected successfully");

		// Optional: Add custom rules for specific sites if needed
		// Example: Force reject on specific problematic sites
		/*
		await page.evaluateOnNewDocument(() => {
			// Custom logic for specific sites that autoconsent doesn't handle well
			window.addEventListener('load', () => {
				// Example: Force click reject on specific selectors
				const rejectButton = document.querySelector('[data-reject-all]');
				if (rejectButton) {
					(rejectButton as HTMLElement).click();
				}
			});
		});
		*/
	} catch (error) {
		logger.warn("Failed to inject cookie consent handler", {
			error: (error as Error).message,
		});
		// Continue without autoconsent - the ad blocker will still hide many banners
	}
}
