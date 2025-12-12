import type { GetInstagramPostReelScreenshotOptions } from "@/lib/puppeteer/screenshot/getInstagramPostReelScreenshot";
import { getErrorMessage } from "@/utils/errorUtils";

import { EMBED_FETCH_HEADERS, EMBED_FETCH_TIMEOUT_MS } from "./constants";
/* eslint-disable import-x/no-unresolved */
import {
	extractEmbedData,
	extractMediaItems,
	parseEmbedContext,
} from "./embedDataParser";
import { extractMediaFromHtml } from "./htmlParser";
/* eslint-enable import-x/no-unresolved */
import type { ExtractInstagramMediaResult, InstagramMedia } from "./types";

export type ExtractInstagramMediaOptions = Pick<
	GetInstagramPostReelScreenshotOptions,
	"logger" | "url"
>;

export async function extractInstagramMediaUrls(
	options: ExtractInstagramMediaOptions,
): Promise<ExtractInstagramMediaResult> {
	const { logger, url } = options;
	let lastError: string | undefined;

	try {
		// Extract shortcode from URL (supports /p/, /reel/, and /tv/)
		const shortcodeMatch = /(?:p|reel|tv)\/([\w-]+)/.exec(url);
		const shortcode = shortcodeMatch?.[1];

		if (!shortcode) {
			throw new Error("Invalid Instagram URL: Could not extract shortcode");
		}

		// Fetch the embed page
		const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
		const response = await fetch(embedUrl, {
			headers: EMBED_FETCH_HEADERS,
			signal: AbortSignal.timeout(EMBED_FETCH_TIMEOUT_MS),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: Failed to fetch embed page`);
		}

		const html = await response.text();

		let mediaList: InstagramMedia[] = [];
		let caption: string | undefined;

		// Try to extract from JSON data
		try {
			const { contextJSON } = extractEmbedData(html);
			const { caption: parsedCaption, shortcodeMedia } =
				parseEmbedContext(contextJSON);

			caption = parsedCaption;
			logger.debug("Extracted caption", { caption });
			if (shortcodeMedia) {
				mediaList = extractMediaItems(shortcodeMedia, logger);
			}
		} catch (error) {
			lastError = getErrorMessage(error);
			logger.warn("JSON extraction failed, trying fallback DOM parsing", {
				error: lastError,
			});
		}

		if (mediaList.length === 0) {
			logger.debug("Attempting DOM parsing for Instagram media");
			try {
				const htmlResult = extractMediaFromHtml(html, logger);
				mediaList = htmlResult.mediaList;
				if (!caption && htmlResult.caption) {
					caption = htmlResult.caption;
					logger.debug("Caption extracted from HTML fallback", { caption });
				}
			} catch (error) {
				lastError = getErrorMessage(error);
				logger.error("Failed to extract media from HTML fallback", {
					error: lastError,
				});
			}
		}

		if (mediaList.length > 0) {
			logger.info("Successfully extracted Instagram media", {
				caption,
				count: mediaList.length,
				shortcode,
			});
			return { caption, mediaList };
		}

		const reason = lastError
			? `Last error: ${lastError}`
			: "No errors captured";
		throw new Error(`No media found in embed data or HTML. ${reason}`);
	} catch (error) {
		const message = getErrorMessage(error);
		if (!isRecoverableError(message)) {
			logger.error("Critical failure extracting Instagram media", {
				error: message,
			});
			throw error;
		}

		logger.warn("Recoverable failure extracting Instagram media", {
			error: message,
		});
		return { caption: undefined, mediaList: [] };
	}
}

function isRecoverableError(message: string) {
	const lower = message.toLowerCase();
	const criticalPatterns = [
		"timeout",
		"etimedout",
		"econnrefused",
		"econnreset",
		"enotfound",
		"rate limit",
		"429",
		"401",
		"403",
		"500",
		"503",
		"out of memory",
	];

	return !criticalPatterns.some((pattern) => lower.includes(pattern));
}
