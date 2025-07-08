import type { Page } from "puppeteer-core";

interface CloudflareChallenge {
	chlApiWidgetId?: string;
}

interface CloudflareWindow extends Window {
	_cf_chl_opt?: CloudflareChallenge;
}

async function cfCheck(page: Page): Promise<boolean> {
	const frames = page.frames();

	for (const frame of frames) {
		try {
			const frameUrl = frame.url();
			const domain = new URL(frameUrl).hostname;

			if (domain === "challenges.cloudflare.com") {
				const id = await frame.evaluate(() => {
					return (globalThis as unknown as CloudflareWindow)._cf_chl_opt
						?.chlApiWidgetId;
				});

				if (!id) continue;

				await frame.waitForFunction(
					(widgetId: string) => {
						const input = document.querySelector<HTMLInputElement>(
							`#cf-chl-widget-${widgetId}_response`,
						);
						return input?.value && input.value !== "";
					},
					{ timeout: 300_000 },
					id,
				);

				const result = await frame.evaluate((widgetId: string) => {
					return document.querySelector<HTMLInputElement>(
						`#cf-chl-widget-${widgetId}_response`,
					)?.value;
				}, id);

				console.log("Cloudflare challenge solved with value:", result);
				return true;
			}
		} catch (error) {
			console.warn("cfCheck error:", (error as Error).message);
		}
	}

	console.log("cfCheck: No Cloudflare challenge frame detected.");
	return false;
}

export default cfCheck;
