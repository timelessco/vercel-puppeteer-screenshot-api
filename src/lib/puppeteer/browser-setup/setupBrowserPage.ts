import type { Viewport } from "rebrowser-puppeteer-core";

import type { GetOrCreatePageReturnType } from "../browser/pageUtils";
import type { CreateLoggerReturnType } from "../core/createLogger";
import { applyAntiDetectionEvasions } from "./applyAntiDetectionEvasions";
import { applyCDPWebdriverRemoval } from "./applyCDPWebdriverRemoval";
import { setupAdBlocker } from "./setupAdBlocker";

const DEFAULT_VIEWPORT: Viewport = {
	deviceScaleFactor: 2,
	height: 1080,
	width: 1920,
};

export interface SetupBrowserPageOptions {
	enableAdBlocker?: boolean;
	enableAntiDetection?: boolean;
	logger: CreateLoggerReturnType;
	page: GetOrCreatePageReturnType;
	viewport?: Viewport;
}

/**
 * Sets up a Puppeteer page with standard configuration including viewport,
 * media features, ad blocking, and cookie consent handling.
 * Should be called immediately after page creation and before navigation.
 * @param {SetupBrowserPageOptions} options - Configuration options for browser page setup
 * @returns {Promise<void>}
 */
export async function setupBrowserPage(
	options: SetupBrowserPageOptions,
): Promise<void> {
	const {
		enableAdBlocker = false,
		enableAntiDetection = true,
		page,
		viewport = DEFAULT_VIEWPORT,
	} = options;
	// Set up logging before any navigation for debugging
	setupLogging(options);

	await page.setViewport(viewport);
	await page.emulateMediaFeatures([
		{ name: "prefers-color-scheme", value: "dark" },
		{ name: "prefers-reduced-motion", value: "reduce" },
	]);

	if (enableAntiDetection) {
		// JavaScript-level anti-detection evasions
		await applyAntiDetectionEvasions(options);

		// CDP-level webdriver removal
		await applyCDPWebdriverRemoval(options);
	}

	if (enableAdBlocker) {
		await setupAdBlocker(options);
	}

	// Most of the ad blocking and cookie consent handling is handled by the Ghostery ad blocker
	// Enable this if when you encounter a site that is not blocked by Ghostery
	// Set up cookie consent handling with DuckDuckGo autoconsent
	// await setupCookieConsent(page, logger);
}

type SetupLoggingOptions = SetupBrowserPageOptions;

/**
 * Sets up logging to capture browser messages/errors
 * @param {SetupLoggingOptions} options - Configuration options for logging setup
 * @returns {void}
 */
function setupLogging(options: SetupLoggingOptions): void {
	const { logger, page } = options;

	page.on("console", (msg) => {
		const type = msg.type();
		const text = msg.text();
		logger.debug(`[setupLogging] Browser console.${type}`, { message: text });
	});

	page.on("pageerror", (err) => {
		logger.debug("[setupLogging] Page JS error", { error: err.message });
	});
}
