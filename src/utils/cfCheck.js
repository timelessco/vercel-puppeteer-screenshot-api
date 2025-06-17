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
  const frames = () => page.frames();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      for (const frame of frames()) {
        try {
          const frameUrl = frame.url();
          const domain = new URL(frameUrl).hostname;

          if (domain === "challenges.cloudflare.com") {
            const id = await frame.evaluate(() => {
              return window._cf_chl_opt?.chlApiWidgetId;
            });

            if (!id) continue;

            // Try waitForFunction with retries inside
            let retries = 2;
            while (retries >= 0) {
              try {
                await frame.waitForFunction(
                  (widgetId) => {
                    const input = document.getElementById(`cf-chl-widget-${widgetId}_response`);
                    return input && input.value && input.value !== "";
                  },
                  {
                    timeout: 30000, // shorter timeout per try
                  },
                  id
                );
                break; // success
              } catch (err) {
                if (
                  (err.message.includes("frame got detached") ||
                    err.message.includes("detached Frame")) &&
                  retries > 0
                ) {
                  console.warn("cfCheck retry: frame detached, retrying...");
                  await page.waitForTimeout(3000);
                  retries--;
                } else {
                  throw err;
                }
              }
            }

            const result = await frame.evaluate((widgetId) => {
              return document.getElementById(`cf-chl-widget-${widgetId}_response`)?.value;
            }, id);

            console.log("Cloudflare challenge solved with value:", result);
            return true;
          }
        } catch (innerErr) {
          if (
            innerErr.message.includes("detached Frame") ||
            innerErr.message.includes("Runtime.callFunctionOn")
          ) {
            console.warn("cfCheck inner frame error:", innerErr.message);
            continue; // Try next frame
          } else {
            throw innerErr;
          }
        }
      }
    } catch (err) {
      console.warn("cfCheck error:", err.message);
      await page.waitForTimeout(3000);
    }
  }

  console.log("cfCheck: No Cloudflare challenge frame detected.");
  return false;
}


