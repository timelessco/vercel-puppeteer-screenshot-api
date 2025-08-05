import { promises as fs } from "node:fs";
import path from "node:path";

import { fullLists, PuppeteerBlocker } from "@ghostery/adblocker-puppeteer";
import fetch from "cross-fetch";
import type { Page } from "rebrowser-puppeteer-core";

import type { Logger } from "./logger";

/**
 * Sets up comprehensive cookie banner blocking using @ghostery/adblocker-puppeteer
 * with fullLists and @duckduckgo/autoconsent for interactive consent dialogs.
 * Follows the official Ghostery example pattern with caching and event listeners.
 * @param {Page} page - The Puppeteer page instance
 * @param {Logger} logger - Logger instance for debugging
 */
export async function setupCookieBannerBlocker(
	page: Page,
	logger: Logger,
): Promise<void> {
	try {
		const blocker = await PuppeteerBlocker.fromLists(
			fetch,
			// Already includes easylist-cookie.txt and annoyances filters
			[...fullLists, "https://secure.fanboy.co.nz/fanboy-annoyance.txt"],
			{ enableCompression: true },
			{
				path: "engine.bin",
				read: fs.readFile,
				write: fs.writeFile,
			},
		);

		// Enable blocking in page
		// @ts-expect-error - Type mismatch between puppeteer and puppeteer-core
		await blocker.enableBlockingInPage(page);

		logger.info("Cookie banner blocker initialized with fullLists");

		// Set up event listeners for debugging (following official example)
		// blocker.on("request-blocked", (request: Request) => {
		// 	logger.debug("Cookie blocker: request blocked", { url: request.url });
		// });

		// blocker.on("request-redirected", (request: Request) => {
		// 	logger.debug("Cookie blocker: request redirected", { url: request.url });
		// });

		// blocker.on("request-whitelisted", (request: Request) => {
		// 	logger.debug("Cookie blocker: request whitelisted", { url: request.url });
		// });

		// blocker.on("csp-injected", (request: Request, csps: string) => {
		// 	logger.debug("Cookie blocker: CSP injected", { csps, url: request.url });
		// });

		// blocker.on("script-injected", (script: string, url: string) => {
		// 	logger.debug("Cookie blocker: script injected", {
		// 		scriptLength: script.length,
		// 		url,
		// 	});
		// });

		// blocker.on("style-injected", (style: string, url: string) => {
		// 	logger.debug("Cookie blocker: style injected", {
		// 		styleLength: style.length,
		// 		url,
		// 	});
		// });

		// blocker.on("filter-matched", ({ exception, filter }, context) => {
		// 	logger.debug("Cookie blocker: filter matched", {
		// 		context,
		// 		exception,
		// 		filter: filter?.toString() ?? "unknown",
		// 	});
		// });

		// Inject autoconsent script for handling consent dialogs
		try {
			// Read the Playwright-specific autoconsent script using path.join
			const autoconsentPath = path.join(
				process.cwd(),
				"node_modules/@duckduckgo/autoconsent/dist/autoconsent.playwright.js",
			);
			const autoconsentScript = await fs.readFile(autoconsentPath, "utf8");

			// Inject the script to run on every page load
			await page.evaluateOnNewDocument(autoconsentScript);

			logger.info("Autoconsent script injected successfully");
		} catch (autoconsentError) {
			logger.warn("Failed to inject autoconsent script", {
				error: (autoconsentError as Error).message,
			});
			// Continue without autoconsent - the adblocker will still work
		}
	} catch (error) {
		logger.warn("Failed to initialize cookie blocker", {
			error: (error as Error).message,
		});
		// Continue without blocker - page will still function
	}
}
