import type { HTTPResponse, Page } from "rebrowser-puppeteer-core";

import { getErrorMessage } from "@/utils/errorUtils";
import type { Logger } from "@/utils/puppeteer/logger";

export interface NavigationOptions {
	fontTimeout?: number;
	navigationTimeout?: number;
	url: string;
}

export async function navigateWithFallback(
	page: Page,
	options: NavigationOptions,
	logger: Logger,
): Promise<HTTPResponse | null> {
	const { fontTimeout = 1000, navigationTimeout = 15_000, url } = options;

	const navTimer = logger.time("Page navigation");
	let response: HTTPResponse | null = null;

	try {
		// First, ensure DOM is loaded quickly
		logger.info("Loading DOM content with networkidle2", { url });
		response = await page.goto(url, {
			timeout: navigationTimeout,
			waitUntil: ["domcontentloaded", "networkidle2"],
		});
		logger.info("DOM content loaded with networkidle2");
	} catch (error) {
		logger.warn("Navigation timeout or error, continuing with current state", {
			error: getErrorMessage(error),
		});
		// Continue with whatever state we got, don't throw
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
