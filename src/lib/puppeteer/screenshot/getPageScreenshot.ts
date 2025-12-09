import { setupBrowserPage } from "@/lib/puppeteer/browser-setup/setupBrowserPage";
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
import { getErrorMessage } from "@/utils/errorUtils";
import type { ScreenshotResult } from "@/app/try/route";

import { getMetadata } from "../core/getMetadata";
import type { WithBrowserOptions } from "../core/withBrowser";
import { captureScreenshot } from "./captureScreenshot";

type GetPageScreenshotOptions = WithBrowserOptions;

/**
 * Screenshot handler that attempts regular navigation and errors on failure
 * @param {GetPageScreenshotOptions} options - Options containing browser, url, logger, and optional metrics flag
 * @returns {Promise<ScreenshotResult | null>} Screenshot buffer with metadata or error page
 */
export async function getPageScreenshot(
	options: GetPageScreenshotOptions,
): Promise<null | ScreenshotResult> {
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

		const metaData = await getMetadata({
			// We set isPageScreenshot to true since the screenshot is 2x compared to the other screenshots
			isPageScreenshot: true,
			logger,
			page,
			url,
		});
		logger.info("Screenshot captured successfully");
		return {
			allImages: [],
			allVideos: [],
			metaData,
			screenshot,
		};
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

export type GetPageScreenshotReturnType = Awaited<
	ReturnType<typeof getPageScreenshot>
>;
