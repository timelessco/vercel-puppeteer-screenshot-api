import { fullLists, PuppeteerBlocker } from "@ghostery/adblocker-puppeteer";
import fetch from "cross-fetch";
import type { Page } from "rebrowser-puppeteer-core";

import { getErrorMessage } from "@/utils/errorUtils";

import type { Logger } from "../logger";

/**
 * Ad and Tracker Blocking via @ghostery/adblocker-puppeteer
 *
 * Ghostery's fullLists includes 16 comprehensive filter lists:
 * - EasyList (70,000+ ad blocking rules)
 * - EasyPrivacy (tracking protection)
 * - EasyList Cookie (cookie banner hiding)
 * - uBlock Origin filters (2020-2024 + main)
 * - uBlock Origin privacy, annoyances (cookies & others)
 * - uBlock Origin badware, quick-fixes, resource-abuse, unbreak
 * - Peter Lowe's Ad and tracking server list
 * - Plus Fanboy Annoyance list (added custom)
 *
 * Blocks common tracking domains including:
 * - Google: googletagmanager, google-analytics, googleadservices, doubleclick
 * - Facebook: facebook.com/tr, connect.facebook.net
 * - Analytics: mixpanel, segment.com, hotjar
 * - Ad networks: adnxs.com, and thousands more
 * - Cookie banners: OneTrust (otBannerSdk.js), and others
 * @param {Page} page - The Puppeteer page instance
 * @param {Logger} logger - Logger instance for debugging
 */
export async function setupAdBlocker(
	page: Page,
	logger: Logger,
): Promise<void> {
	try {
		const blocker = await PuppeteerBlocker.fromLists(
			fetch,
			[
				...fullLists,
				// Additional aggressive blocking for annoyances
				"https://secure.fanboy.co.nz/fanboy-annoyance.txt",
			],
			{ enableCompression: true },
		);

		// Enable blocking in page
		// @ts-expect-error - Type mismatch between puppeteer and rebrowser-puppeteer-core
		await blocker.enableBlockingInPage(page);

		logger.info("Ad blocker initialized with Ghostery fullLists + Fanboy");

		// Optional: Enable debug event listeners
		// Uncomment for debugging blocked requests
		/*
		blocker.on("request-blocked", (request: Request) => {
			logger.debug("Ad blocker: request blocked", { url: request.url });
		});

		blocker.on("request-redirected", (request: Request) => {
			logger.debug("Ad blocker: request redirected", { url: request.url });
		});

		blocker.on("request-whitelisted", (request: Request) => {
			logger.debug("Ad blocker: request whitelisted", { url: request.url });
		});

		blocker.on("csp-injected", (request: Request, csps: string) => {
			logger.debug("Ad blocker: CSP injected", { csps, url: request.url });
		});

		blocker.on("script-injected", (script: string, url: string) => {
			logger.debug("Ad blocker: script injected", {
				scriptLength: script.length,
				url,
			});
		});

		blocker.on("style-injected", (style: string, url: string) => {
			logger.debug("Ad blocker: style injected", {
				styleLength: style.length,
				url,
			});
		});

		blocker.on("filter-matched", ({ exception, filter }, context) => {
			logger.debug("Ad blocker: filter matched", {
				context,
				exception,
				filter: filter?.toString() ?? "unknown",
			});
		});
		*/
	} catch (error) {
		logger.warn("Failed to initialize ad blocker", {
			error: getErrorMessage(error),
		});

		// Continue without blocker - page will still function
	}
}
