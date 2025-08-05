/**
 * Cloudflare Check Tools:
 * https://nopecha.com/demo/cloudflare
 * https://nowsecure.nl/
 * https://2captcha.com/demo/cloudflare-turnstile
 *
 * Browser Check Tools:
 * https://infosimples.github.io/detect-headless/
 * https://arh.antoinevastel.com/bots/areyouheadless
 * https://bot.sannysoft.com/
 * https://hmaker.github.io/selenium-detector/
 * https://kaliiiiiiiiii.github.io/brotector/
 *
 * Resources:
 * https://github.com/berstend/puppeteer-extra/issues/908
 */

import type { Page } from "rebrowser-puppeteer-core";

import type { Logger } from "./logger";

interface CloudflareChallenge {
	chlApiWidgetId?: string;
}

interface CloudflareWindow extends Window {
	_cf_chl_opt?: CloudflareChallenge;
}

/**
 * Injects Cloudflare auto-solver script into the page using page.evaluate()
 * This replaces the previous preload script approach
 * @param {Page} page - The Puppeteer page instance
 * @param {Logger} logger - Logger instance for debugging
 */
// TODO: This is not working, need to find a better way to solve the challenge
async function injectCloudflareAutoSolver(
	page: Page,
	logger: Logger,
): Promise<void> {
	try {
		const cloudflareClicker = () => {
			// Check both main domain and iframes
			const isCloudflareChallenge =
				globalThis.location.host === "challenges.cloudflare.com" ||
				globalThis.location.href.includes("challenges.cloudflare.com");

			if (!isCloudflareChallenge) {
				console.log(
					"[CF-Solver] Not on Cloudflare challenge page, current host:",
					globalThis.location.host,
				);
				return;
			}

			console.log(
				"[CF-Solver] Cloudflare challenge page detected, initializing auto-solver",
			);
			const targetSelector = "input[type=checkbox]";
			let clickAttempts = 0;

			const observer = new MutationObserver((mutationsList) => {
				for (const mutation of mutationsList) {
					if (mutation.type === "childList") {
						const addedNodes = [...mutation.addedNodes];
						for (const addedNode of addedNodes) {
							if (addedNode.nodeType === Node.ELEMENT_NODE) {
								const element = addedNode as Element;
								const checkbox = element.querySelector(targetSelector);
								if (checkbox && checkbox instanceof HTMLElement) {
									clickAttempts++;
									console.log(
										`[CF-Solver] Found checkbox (attempt #${clickAttempts}), attempting to click parent element`,
									);

									const parent = checkbox.parentElement;
									if (parent) {
										console.log(
											"[CF-Solver] Clicking parent element:",
											parent.tagName,
											parent.className,
										);
										parent.click();
										console.log("[CF-Solver] Click completed");
									} else {
										console.warn(
											"[CF-Solver] No parent element found for checkbox",
										);
									}
								}
							}
						}
					}
				}
			});

			const observerOptions = {
				childList: true,
				subtree: true,
			};

			console.log("[CF-Solver] Starting DOM observation");
			observer.observe(document.body, observerOptions);
		};

		console.log("[CF-Solver] Initializing Cloudflare auto-solver");
		await page.evaluate(cloudflareClicker);

		logger.debug("[CF-Solver] Auto-solver injected successfully");
	} catch (error) {
		logger.warn("[CF-Solver] Failed to inject auto-solver", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function cloudflareChecker(
	page: Page,
	logger: Logger,
): Promise<boolean> {
	logger.info("[CF-Checker] Running Cloudflare check");
	const frames = page.frames();

	for (const frame of frames) {
		try {
			const frameUrl = frame.url();
			const domain = new URL(frameUrl).hostname;

			if (domain === "challenges.cloudflare.com") {
				logger.info("[CF-Checker] Cloudflare challenge detected");

				// Inject the auto-solver script into the challenge frame
				await injectCloudflareAutoSolver(page, logger);

				const id = await frame.evaluate(() => {
					return (globalThis as unknown as CloudflareWindow)._cf_chl_opt
						?.chlApiWidgetId;
				});

				if (!id) {
					logger.debug("[CF-Checker] No Cloudflare widget ID found");
					continue;
				}
				logger.debug("[CF-Checker] Cloudflare widget ID found", {
					widgetId: id,
				});

				await frame.waitForFunction(
					(widgetId: string) => {
						const input = document.querySelector<HTMLInputElement>(
							`#cf-chl-widget-${widgetId}_response`,
						);
						return input?.value && input.value != "";
					},
					{ timeout: 10_000 },
					id,
				);

				const result = await frame.evaluate((widgetId: string) => {
					return document.querySelector<HTMLInputElement>(
						`#cf-chl-widget-${widgetId}_response`,
					)?.value;
				}, id);

				logger.info("[CF-Checker] Cloudflare challenge solved", {
					value: result,
				});
				return true;
			}
		} catch (error) {
			logger.error("[CF-Checker] Frame error", {
				error: (error as Error).message,
			});
		}
	}

	logger.info("[CF-Checker] Cloudflare check completed");
	return false;
}
