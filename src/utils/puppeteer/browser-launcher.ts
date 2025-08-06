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
 * Shared arguments for consistent behavior between environments
 * These args work well in both Vercel and local development
 */
const SHARED_LAUNCH_ARGS = [
	// Anti-detection arguments
	// Removes "Chrome is being controlled by automated software" flag
	"--disable-blink-features=AutomationControlled",
	// Prevents Chrome from downloading field trial configs that sites detect
	"--disable-field-trial-config",
	// Disable features that might reveal automation
	"--disable-features=IsolateOrigins,site-per-process,TranslateUI",
	// Additional anti-detection flags
	"--enable-automation=false",
	"--disable-web-security=false",
	// Window size for realistic browsing
	"--window-size=1920,1080",
	"--start-maximized",

	// Performance optimizations
	"--disable-domain-reliability",
	"--no-default-browser-check",
	"--no-pings",
	"--disable-print-preview",

	// Consistent rendering across environments
	"--font-render-hinting=none",
] as const;

/**
 * Vercel-specific arguments for serverless environment
 * These are critical for Vercel but may cause issues locally
 */
const VERCEL_ONLY_ARGS = [
	// Critical for Vercel - prevents /dev/shm memory issues
	// Forces Chrome to use /tmp instead of /dev/shm for shared memory
	// /dev/shm is limited to 64MB in serverless causing crashes
	"--disable-dev-shm-usage",
] as const;

/**
 * Local development specific arguments
 * Provides better debugging and stability for local testing
 */
const LOCAL_DEV_ARGS = [
	// Better stability with multi-process (avoid --single-process locally)
	// Keep sandboxing enabled for security during development
	// Use hardware acceleration when available
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
		args: [...SHARED_LAUNCH_ARGS],
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

			launchOptions = {
				...launchOptions,
				args: [
					// chromium.args already includes: --single-process, --no-zygote, --no-sandbox, etc.
					...chromium.args,
					...VERCEL_ONLY_ARGS,
					...(launchOptions.args ?? []),
				],
				executablePath: await chromium.executablePath(),
			};

			logger.info("Chromium configured for Vercel", {
				argsCount: launchOptions.args?.length,
				executablePath: launchOptions.executablePath,
			});
		} else {
			// Development: Use full puppeteer with bundled browser
			launchOptions.args = [...(launchOptions.args ?? []), ...LOCAL_DEV_ARGS];
			logger.info("Using rebrowser-puppeteer for local development", {
				argsCount: launchOptions.args.length,
			});

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
 * Helper to close a single page safely
 * @param {Page} page - The page to close
 * @param {Logger} logger - Logger for debugging
 */
async function closePageSafely(page: Page, logger: Logger): Promise<void> {
	try {
		await page.close();
	} catch (error: unknown) {
		logger.warn("Failed to close page", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Helper to create a timeout promise
 * @param {number} ms - Timeout in milliseconds
 */
function createTimeoutPromise(ms: number): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => {
			reject(new Error("Browser close timeout"));
		}, ms);
	});
}

/**
 * Gracefully closes browser with timeout protection for Vercel.
 * Issue: browser.close() hangs with @sparticuz/chromium v138 causing 300s timeout
 * Solution: Race condition with 5s timeout + disconnect fallback
 * @param {Browser} browser - The browser instance to close
 * @param {Logger} logger - Logger for debugging
 */
export async function closeBrowser(
	browser: Browser,
	logger: Logger,
): Promise<void> {
	logger.info("Closing browser");

	// Close all pages first - reduces chance of browser.close() hanging
	const pages = await browser.pages();
	logger.info(`Closing ${pages.length} pages`);

	const pageClosePromises = pages.map((page) => closePageSafely(page, logger));
	await Promise.all(pageClosePromises);

	// Try to close browser with timeout protection
	try {
		// Race: browser.close() vs 5-second timeout
		// Prevents infinite hang that causes Vercel 300s timeout
		await Promise.race([browser.close(), createTimeoutPromise(5000)]);

		logger.info("Browser closed successfully");
		return;
	} catch (error) {
		// Fallback to disconnect if close times out
		// In Vercel, container cleanup kills Chrome process anyway
		// Better to return success than timeout after 300s
		logger.warn("Browser.close() timed out, using disconnect", {
			error: error instanceof Error ? error.message : String(error),
		});
		void browser.disconnect();
	}
}
