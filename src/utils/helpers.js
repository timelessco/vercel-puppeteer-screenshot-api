import { PuppeteerBlocker } from "@cliqz/adblocker-puppeteer";
import fetch from "cross-fetch";
export async function manualCookieBannerRemoval(page) {
    try {
        await page.evaluate(() => {
            // window.scrollBy(0, 1920);
            const selectors = [
                // Generic cookie/consent selectors
                '[id*="cookie"]',
                '[class*="cookie"]',
                '[id*="consent"]',
                '[class*="consent"]',
                '[id*="gdpr"]',
                '[class*="gdpr"]',
                '[id*="privacy"]',
                '[class*="privacy"]',

                // Role-based selectors
                'div[role="dialog"]',
                'div[role="alertdialog"]',

                // Common class names
                '.cookie-banner',
                '.consent-banner',
                '.privacy-banner',
                '.gdpr-banner',
                '#cookie-notice',
                '.cookie-notice',

                // Popular consent management platforms
                '.onetrust-banner-sdk', // OneTrust
                '.ot-sdk-container',
                '#didomi-host', // Didomi
                '.didomi-consent-popup',
                '.fc-consent-root', // Funding Choices
                '.fc-dialog-container',
                '.cmp-banner_banner', // General CMP
                '.cookielaw-banner',
                '.cookie-law-info-bar',

                // Additional patterns
                '[data-testid*="cookie"]',
                '[data-testid*="consent"]',
                '[aria-label*="cookie"]',
                '[aria-label*="consent"]',
                '[aria-describedby*="cookie"]',

                // Fixed position overlays that might be cookie banners
                'div[style*="position: fixed"][style*="z-index"]',

                // Text-based detection for stubborn banners
                '*[class*="accept-all"]',
                '*[class*="accept-cookies"]',
                '*[id*="accept-all"]',
                '*[id*="accept-cookies"]'
            ];

            let removedCount = 0;

            selectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        // Additional validation to avoid removing legitimate content
                        if (el && el.parentNode) {
                            const text = el.textContent?.toLowerCase() || '';
                            const hasKeywords = ['cookie', 'consent', 'privacy', 'gdpr', 'accept', 'reject', 'manage preferences'].some(keyword =>
                                text.includes(keyword)
                            );

                            // Remove if it contains cookie-related keywords or matches specific selectors
                            if (hasKeywords || selector.includes('cookie') || selector.includes('consent') || selector.includes('onetrust') || selector.includes('didomi')) {
                                el.remove();
                                removedCount++;
                            }
                        }
                    });
                } catch (e) {
                    // Ignore selector errors
                    console.debug(`Error with selector "${selector}":`, e.message);
                }
            });

            // Also look for and remove backdrop/overlay elements that might be related to cookie banners
            const overlays = document.querySelectorAll('div[style*="position: fixed"], div[style*="position: absolute"]');
            overlays.forEach(overlay => {
                const style = window.getComputedStyle(overlay);
                const zIndex = parseInt(style.zIndex) || 0;
                const opacity = parseFloat(style.opacity) || 1;

                // Remove high z-index, semi-transparent overlays that might be cookie banner backdrops
                if (zIndex > 1000 && opacity < 1 && opacity > 0) {
                    const text = overlay.textContent?.toLowerCase() || '';
                    if (text.includes('cookie') || text.includes('consent') || text.includes('privacy')) {
                        overlay.remove();
                        removedCount++;
                    }
                }
            });

            console.log(`Manual cookie banner removal: ${removedCount} elements removed`);
            return removedCount;
        });
    } catch (error) {
        console.warn("Manual cookie banner removal failed:", error.message);
    }
}

let blocker = null;


export async function blockCookieBanners(page) {
    try {
        if (!blocker) {
            console.log("Initializing cookie banner blocker...");
            blocker = await PuppeteerBlocker.fromLists(fetch, [
                // Cookie banners filter list from EasyList
                "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt",
            ]);
            console.log("Cookie banner blocker initialized successfully");
        }

        await blocker.enableBlockingInPage(page);
        console.log("Cookie banner blocking enabled for page");
    } catch (error) {
        console.warn("Failed to initialize cookie blocker:", error.message);
        // Continue without blocker - manual removal will still work
    }
}

//screenshot funstion for Instagram 
export async function getScreenshotInstagram(page, urlStr, imageIndex) {

    let buffer = null;
    const ogImage = await page.evaluate(() => {
        const meta = document.querySelector('meta[property="og:image"]');
        return meta ? meta.content : null;
    });

    if (ogImage) {
        console.log("Found og:image:", ogImage);
        const imageRes = await fetch(ogImage);
        const arrayBuffer = await imageRes.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
    } else {
        console.warn("No og:image found — taking fallback screenshot");
        buffer = await page.screenshot({ type: "png" });
        const headers = new Headers();
        headers.set("Content-Type", "image/png");
        headers.set("Content-Length", buffer.length.toString());
        return buffer
    }

    if (urlStr.includes("/reel/")) {
        return buffer;
    }

    if (urlStr.includes("/p/")) {
        const ariaLabel = "Next";
        const index = imageIndex ? parseInt(imageIndex) : null;

        if (index && index > 1) {
            for (let i = 0; i < index; i++) {
                await page.waitForSelector(`[aria-label="${ariaLabel}"]`, { visible: true });
                await page.click(`[aria-label="${ariaLabel}"]`);
                await new Promise((res) => setTimeout(res, 500));
            }
        }

        const divs = await page.$$("article > div");
        if (divs.length >= 1) {
            const imgs = await divs[1].$$("img");
            console.log("Found images:", imgs.length);

            const srcHandle = await imgs[index && index > 1 ? 1 : 0].getProperty("src");
            const src = await srcHandle.jsonValue();

            const imageRes = await fetch(src);
            const arrayBuffer = await imageRes.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
        }
    }
    return buffer;
}
