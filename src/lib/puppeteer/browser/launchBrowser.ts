import { addExtra, PuppeteerExtra } from "puppeteer-extra";
import PuppeteerExtraPluginStealth from "puppeteer-extra-plugin-stealth";

import "puppeteer-extra-plugin-stealth/evasions/chrome.app";
import "puppeteer-extra-plugin-stealth/evasions/user-agent-override";

import type { LaunchOptions } from "rebrowser-puppeteer-core";

import { getErrorMessage } from "@/utils/errorUtils";
import type { GetScreenshotOptions } from "@/app/try/route";

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
	// site-per-process disabled to prevent "detached frame" errors
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
	// Forces Chrome to use /tmp instead of limited 64MB /dev/shm in serverless
	"--disable-dev-shm-usage",

	// Below Memory management for serverless environment was necessary to address the below issue
	// https://github.com/timelessco/vercel-puppeteer-screenshot-api/issues/46
	// Limits V8 heap to 512MB to prevent OOM kills in serverless
	"--max_old_space_size=512",
	// Limits V8 semi-space (young generation) to reduce memory spikes
	"--max-semi-space-size=64",
	// Hard limit on total heap size to stay within container limits
	"--max-heap-size=512",

	// Disable GPU features to save memory
	// Disables GPU hardware acceleration which isn't available in serverless
	"--disable-gpu",
	// Disables GPU sandbox to reduce overhead in headless mode
	"--disable-gpu-sandbox",
	// Disables canvas hardware acceleration to save memory
	"--disable-accelerated-2d-canvas",
	// Uses software JPEG decoding to reduce memory usage
	"--disable-accelerated-jpeg-decoding",
	// Uses software MJPEG decoding to reduce memory usage
	"--disable-accelerated-mjpeg-decode",
	// Uses software video decoding to reduce memory usage
	"--disable-accelerated-video-decode",

	// Additional stability flags
	// Prevents Chrome from throttling timers in background tabs
	"--disable-background-timer-throttling",
	// Keeps renderer process active preventing "Target closed" errors
	"--disable-renderer-backgrounding",
	// Disables unused features to reduce memory footprint
	"--disable-features=TranslateUI,BlinkGenPropertyTrees",

	// Process management
	// Prevents Chrome from suspending hidden windows
	"--disable-backgrounding-occluded-windows",
	// Prevents IPC message limits that can close connections
	"--disable-ipc-flooding-protection",
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

export interface LaunchBrowserOptions {
	headless: GetScreenshotOptions["headless"];
	logger: GetScreenshotOptions["logger"];
	timeout?: LaunchOptions["timeout"];
}

/**
 * Launches a browser instance with environment-specific configuration
 * Automatically detects Vercel deployment and configures Chromium accordingly
 * @param {LaunchBrowserOptions} options - Configuration options for browser launch
 * @returns {Promise<LaunchBrowserReturnType>} Browser instance ready for use
 * @throws {Error} If browser fails to launch within the timeout period
 */
export async function launchBrowser(options: LaunchBrowserOptions) {
	const { headless = true, logger, timeout = 30_000 } = options;

	// Detect deployment environment
	const isVercel = !!process.env.VERCEL_ENV;

	logger.info("Preparing browser launch", {
		environment: isVercel ? "Vercel" : "Local",
		headless,
		timeout,
	});

	let rebrowserPuppeteer: typeof import("rebrowser-puppeteer-core");
	let puppeteer: PuppeteerExtra;
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

			rebrowserPuppeteer = await import("rebrowser-puppeteer-core");

			launchOptions = {
				...launchOptions,
				args: [
					// chromium.args includes: --no-zygote, --no-sandbox, etc.
					// Filter out --single-process to improve stability on resource heavy sites like https://v7labs.com/
					// See https://github.com/puppeteer/puppeteer/issues/11515#issuecomment-2364155101
					...chromium.args.filter((arg) => arg !== "--single-process"),
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
			rebrowserPuppeteer = await import("rebrowser-puppeteer");
		}

		// @ts-expect-error - Type incompatibility between rebrowserPuppeteer and puppeteer-extra
		puppeteer = addExtra(rebrowserPuppeteer);
		const stealth = PuppeteerExtraPluginStealth();
		// @ts-expect-error - Type incompatibility between rebrowserPuppeteer and puppeteer-extra
		const browser = await puppeteer.use(stealth).launch(launchOptions);

		logger.info("Browser launched successfully", {
			browserVersion: await browser.version(),
		});

		return browser;
	} catch (error) {
		const errorMessage = getErrorMessage(error);
		logger.error("Failed to launch browser", {
			environment: isVercel ? "Vercel" : "Local",
			error: errorMessage,
		});

		// Re-throw with more context
		throw new Error(`Browser launch failed: ${errorMessage}`);
	}
}

export type LaunchBrowserReturnType = Awaited<ReturnType<typeof launchBrowser>>;
