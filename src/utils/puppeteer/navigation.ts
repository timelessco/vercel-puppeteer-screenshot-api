import type { HTTPResponse, Page } from "rebrowser-puppeteer-core";

import type { Logger } from "@/utils/puppeteer/logger";

export interface NavigationOptions {
	domContentTimeout?: number;
	fontTimeout?: number;
	networkIdleTimeout?: number;
	url: string;
}

export async function navigateWithFallback(
	page: Page,
	options: NavigationOptions,
	logger: Logger,
): Promise<HTTPResponse | null> {
	const {
		domContentTimeout = 10_000,
		fontTimeout = 1000,
		networkIdleTimeout = 15_000,
		url,
	} = options;

	const navTimer = logger.time("Page navigation");
	let response: HTTPResponse | null = null;

	try {
		// First, ensure DOM is loaded quickly
		logger.info("Loading DOM content", { url });
		response = await page.goto(url, {
			timeout: domContentTimeout,
			waitUntil: "domcontentloaded",
		});
		logger.info("DOM content loaded");

		// Then wait for network idle (but don't fail if it times out)
		try {
			logger.info("Waiting for network idle");
			await page.goto(url, {
				timeout: networkIdleTimeout,
				waitUntil: "networkidle2",
			});
			logger.info("Network idle achieved");
		} catch (error) {
			logger.warn("Network idle timeout - continuing with current state", {
				error: (error as Error).message,
			});
		}
	} catch (error) {
		logger.error("Navigation failed", {
			error: (error as Error).message,
		});
		throw error;
	}
	navTimer();

	// Wait for fonts to load (but don't fail if timeout)
	logger.info("Waiting for fonts to load");
	try {
		await page.evaluate(() => document.fonts.ready, { timeout: fontTimeout });
		logger.debug("Fonts loaded");
	} catch {
		logger.debug("Font loading timeout, proceeding anyway");
	}

	return response;
}
