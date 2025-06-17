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

async function cfCheck(page) {
  const frames = await page.frames();

  for (const frame of frames) {
    try {
      const frameUrl = frame.url();
      const domain = new URL(frameUrl).hostname;

      if (domain === "challenges.cloudflare.com") {
        const id = await frame.evaluate(() => {
          return window._cf_chl_opt?.chlApiWidgetId;
        });

        if (!id) continue;

        await frame.waitForFunction(
          (widgetId) => {
            const input = document.getElementById(`cf-chl-widget-${widgetId}_response`);
            return input && input.value && input.value !== "";
          },
          { timeout: 300_000 },
          id
        );

        const result = await frame.evaluate((widgetId) => {
          return document.getElementById(`cf-chl-widget-${widgetId}_response`)?.value;
        }, id);

        console.log("Cloudflare challenge solved with value:", result);
        return true;
      }
    } catch (err) {
      console.warn("cfCheck error:", err.message);
    }
  }

  console.log("cfCheck: No Cloudflare challenge frame detected.");
  return false;
}

module.exports = cfCheck;

