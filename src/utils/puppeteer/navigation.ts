import type { HTTPResponse } from "rebrowser-puppeteer-core";

import { getErrorMessage } from "@/utils/errorUtils";
import type { GetOrCreatePageReturnType } from "@/utils/puppeteer/page-utils";
import type { ProcessUrlReturnType } from "@/utils/puppeteer/url-processor";
import type { GetScreenshotOptions } from "@/app/try/route";

interface GotoPageOptions {
	fontTimeout?: number;
	logger: GetScreenshotOptions["logger"];
	navigationTimeout?: number;
	page: GetOrCreatePageReturnType;
	url: ProcessUrlReturnType;
}

export async function gotoPage(
	options: GotoPageOptions,
): Promise<HTTPResponse | null> {
	const {
		fontTimeout = 1000,
		logger,
		navigationTimeout = 15_000,
		page,
		url,
	} = options;

	logger.info("Starting page navigation", { url });
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

	// Check response status and log warning if not ok
	if (!response?.ok()) {
		logger.warn("Navigation response not ok", {
			status: response?.status(),
			statusText: response?.statusText(),
		});
	}

	return response;
}
