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
 */

import type { Page } from "rebrowser-puppeteer-core";

import type { Logger } from "./logger";

interface CloudflareChallenge {
	chlApiWidgetId?: string;
}

interface CloudflareWindow extends Window {
	_cf_chl_opt?: CloudflareChallenge;
}

export async function cfCheck(page: Page, logger: Logger): Promise<boolean> {
	const frames = page.frames();

	for (const frame of frames) {
		try {
			const frameUrl = frame.url();
			const domain = new URL(frameUrl).hostname;

			if (domain === "challenges.cloudflare.com") {
				logger.info("Cloudflare challenge detected");
				const id = await frame.evaluate(() => {
					return (globalThis as unknown as CloudflareWindow)._cf_chl_opt
						?.chlApiWidgetId;
				});

				if (!id) {
					logger.debug("No Cloudflare widget ID found");
					continue;
				}
				logger.debug("Cloudflare widget ID found", { widgetId: id });

				await frame.waitForFunction(
					(widgetId: string) => {
						const input = document.querySelector<HTMLInputElement>(
							`#cf-chl-widget-${widgetId}_response`,
						);
						return input?.value && input.value != "";
					},
					{ timeout: 300_000 },
					id,
				);

				const result = await frame.evaluate((widgetId: string) => {
					return document.querySelector<HTMLInputElement>(
						`#cf-chl-widget-${widgetId}_response`,
					)?.value;
				}, id);

				logger.info("Cloudflare challenge solved", { value: result });
				return true;
			}
		} catch (error) {
			logger.error("cfCheck frame error", { error: (error as Error).message });
		}
	}

	return false;
}
