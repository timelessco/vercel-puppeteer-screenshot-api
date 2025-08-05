import type { Browser, LaunchOptions, Page } from "rebrowser-puppeteer-core";

import type { Logger } from "./logger";

export interface BrowserLaunchOptions {
	headless: LaunchOptions["headless"];

	logger: Logger;

	timeout?: number;
}

export interface BrowserLaunchResult {
	browser: Browser;

	page: Page;
}

/**
 * Base launch options shared between environments
 */
const BASE_LAUNCH_ARGS = [
	// Autoset in headless environment but needed for development
	"--enable-automation",
	// X.com doesn't work without this
	"--disable-field-trial-config",
	// Disable certain features to avoid detection
	"--disable-blink-features=AutomationControlled",
] as const;

/**
 * Launches a browser instance with environment-specific configuration.
 * Automatically detects Vercel deployment and configures Chromium accordingly.
 * @param {BrowserLaunchOptions} options - Configuration options for browser launch
 * @returns {Promise<BrowserLaunchResult>} Browser and page instances ready for use
 * @throws {Error} If browser fails to launch within the timeout period
 * @example
 * ```typescript
 * const { browser, page } = await launchBrowser({
 *   headless: true,
 *   logger: myLogger,
 *   timeout: 60000
 * });
 * ```
 */
export async function launchBrowser(
	options: BrowserLaunchOptions,
): Promise<BrowserLaunchResult> {
	const { headless = true, logger, timeout = 30_000 } = options;

	// Detect deployment environment
	const isVercel = !!process.env.VERCEL_ENV;

	logger.info("Preparing browser launch", {
		environment: isVercel ? "Vercel" : "Local",
		headless,
		timeout,
	});

	let puppeteer: typeof import("rebrowser-puppeteer-core");
	let launchOptions: LaunchOptions = {
		args: [...BASE_LAUNCH_ARGS],
		headless,
		timeout,
	};

	try {
		if (isVercel) {
			// Production: Use puppeteer-core with Chromium for serverless
			logger.info("Loading Chromium for Vercel deployment");

			// Dynamic import to reduce bundle size
			const chromiumModule = (await import(
				"@sparticuz/chromium"
			)) as unknown as typeof import("@sparticuz/chromium");
			const chromium = chromiumModule.default;

			puppeteer = await import("rebrowser-puppeteer-core");

			// Merge Chromium args with our base args
			launchOptions = {
				...launchOptions,
				args: [...chromium.args, ...(launchOptions.args ?? [])],
				executablePath: await chromium.executablePath(),
			};

			logger.info("Chromium configured", {
				argsCount: launchOptions.args?.length,
				executablePath: launchOptions.executablePath,
			});
		} else {
			// Development: Use full puppeteer with bundled browser
			logger.info("Using rebrowser-puppeteer for local development");

			// @ts-expect-error - Type incompatibility between puppeteer and puppeteer-core
			puppeteer = await import("rebrowser-puppeteer");
		}

		const browser = await puppeteer.launch(launchOptions);

		logger.info("Browser launched successfully", {
			browserVersion: await browser.version(),
		});

		// Optimize page creation: reuse existing page if available
		const pages = await browser.pages();
		const page = pages[0] || (await browser.newPage());

		const allPages = await browser.pages();
		logger.info("Page ready", {
			reusedPage: pages.length > 0,
			totalPages: allPages.length,
		});

		return { browser, page };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error("Failed to launch browser", {
			environment: isVercel ? "Vercel" : "Local",
			error: errorMessage,
		});

		// Re-throw with more context
		throw new Error(`Browser launch failed: ${errorMessage}`);
	}
}

/**
 * Gracefully closes a browser instance with proper cleanup
 * @param {Browser} browser - The browser instance to close
 * @param {Logger} logger - Logger for debugging
 */
export async function closeBrowser(
	browser: Browser,
	logger: Logger,
): Promise<void> {
	try {
		logger.info("Closing browser");
		await browser.close();
		logger.info("Browser closed successfully");
	} catch (error) {
		logger.error("Error closing browser", {
			error: error instanceof Error ? error.message : String(error),
		});
		// Don't re-throw as browser might already be closed
	}
}
