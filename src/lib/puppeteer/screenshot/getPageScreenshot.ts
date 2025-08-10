import { setupBrowserPage } from "@/lib/puppeteer/browser-setup/setupBrowserPage";
import type { LaunchBrowserReturnType } from "@/lib/puppeteer/browser/launchBrowser";
import {
	closePageSafely,
	getOrCreatePage,
	getPageMetrics,
	type GetOrCreatePageReturnType,
} from "@/lib/puppeteer/browser/pageUtils";
import { cloudflareChecker } from "@/lib/puppeteer/navigation/cloudflareChecker";
import {
	gotoPage,
	handleDialogs,
} from "@/lib/puppeteer/navigation/navigationUtils";
import type { ProcessUrlReturnType } from "@/lib/puppeteer/request/processUrl";
import { getErrorMessage } from "@/utils/errorUtils";
import type { GetScreenshotOptions } from "@/app/try/route";

import { extractPageMetadata } from "../core/extractPageMetadata";
import { captureScreenshot } from "./captureScreenshot";

interface GetPageScreenshotOptions {
	browser: LaunchBrowserReturnType;
	fullPage: GetScreenshotOptions["fullPage"];
	logger: GetScreenshotOptions["logger"];
	shouldGetPageMetrics: GetScreenshotOptions["shouldGetPageMetrics"];
	url: ProcessUrlReturnType;
}

/**
 * Screenshot handler that attempts regular navigation and errors on failure
 * @param {GetPageScreenshotOptions} options - Options containing browser, url, logger, and optional metrics flag
 * @returns {Promise<{ metaData: Awaited<ReturnType<typeof extractPageMetadata>> | null; screenshot: Buffer }>} Screenshot buffer with metadata or error page
 */
export async function getPageScreenshot(
	options: GetPageScreenshotOptions,
): Promise<{
	metaData: Awaited<ReturnType<typeof extractPageMetadata>> | null;
	screenshot: Buffer;
}> {
	const { browser, fullPage, logger, shouldGetPageMetrics, url } = options;
	let page: GetOrCreatePageReturnType | null = null;

	try {
		logger.info("Using screenshot handler");

		// Complete page navigation sequence
		page = await getOrCreatePage({ browser, logger });
		await setupBrowserPage({ logger, page });
		await gotoPage({ logger, page, url });
		if (shouldGetPageMetrics) await getPageMetrics({ logger, page });
		await cloudflareChecker({ logger, page });
		await handleDialogs({ logger, page });

		// Take screenshot
		const screenshot = await captureScreenshot({
			logger,
			screenshotOptions: { fullPage },
			target: page,
			timerLabel: "Page screenshot",
		});

		const metaData = await extractPageMetadata({ logger, page, url });
		logger.info("Screenshot captured successfully");
		return { metaData, screenshot };
	} catch (error) {
		// If navigation fails, create an error page
		logger.error("Navigation failed, creating error page", {
			error: getErrorMessage(error),
		});

		throw error;
	} finally {
		if (page) await closePageSafely({ logger, page });
	}
}
