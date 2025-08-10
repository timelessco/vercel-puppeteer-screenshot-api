import { getErrorMessage } from "@/utils/errorUtils";
import type { GetScreenshotOptions } from "@/app/try/route";

import type { GetOrCreatePageReturnType } from "../page-utils";

interface GetMetadataOptions {
	logger: GetScreenshotOptions["logger"];
	page: GetOrCreatePageReturnType;
	url: GetScreenshotOptions["url"];
}

export async function getMetadata(options: GetMetadataOptions) {
	const { logger, page, url: urlStr } = options;
	logger.info("Fetching metadata for URL", { url: urlStr });

	try {
		const navTimer = logger.time("Metadata page navigation");
		await page.goto(urlStr, {
			timeout: 300_000,
			waitUntil: "networkidle2",
		});
		navTimer();
		logger.debug("Page loaded for metadata extraction");

		const metadata = await page.evaluate(() => {
			// eslint-disable-next-line unicorn/consistent-function-scoping
			const getMetaContent = (selector: string): null | string => {
				const el = document.querySelector(selector);
				return el ? el.getAttribute("content") : null;
			};

			const ogImage =
				getMetaContent('meta[property="og:image"]') ??
				getMetaContent('link[rel="image_src"]');

			const title =
				getMetaContent('meta[property="og:title"]') ?? document.title;

			const description =
				getMetaContent('meta[property="og:description"]') ??
				getMetaContent('meta[name="description"]');

			const favIcon =
				document
					.querySelector<HTMLLinkElement>('link[rel="icon"]')
					?.getAttribute("href") ??
				document
					.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]')
					?.getAttribute("href") ??
				null;

			return {
				description,
				favIcon,
				ogImage,
				title,
			};
		});

		logger.info("Metadata extraction completed", {
			descriptionLength: metadata.description?.length ?? 0,
			hasDescription: !!metadata.description,
			hasFavIcon: !!metadata.favIcon,
			hasOgImage: !!metadata.ogImage,
			hasTitle: !!metadata.title,
			title: metadata.title ? metadata.title.slice(0, 50) + "..." : null,
		});

		if (!metadata.title && !metadata.ogImage && !metadata.description) {
			logger.warn("No meaningful metadata found", { url: urlStr });
		}

		return metadata;
	} catch (error) {
		logger.error("Failed to extract metadata, returning empty metadata", {
			error: getErrorMessage(error),
			url: urlStr,
		});
		return null;
	}
}

export type GetMetadataReturnType = Awaited<ReturnType<typeof getMetadata>>;
