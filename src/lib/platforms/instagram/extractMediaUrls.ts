import { parse } from "node-html-parser";
import { z } from "zod";

import type { GetInstagramPostReelScreenshotOptions } from "@/lib/puppeteer/screenshot/getInstagramPostReelScreenshot";
import { getErrorMessage } from "@/utils/errorUtils";

import type {
	ExtractInstagramMediaResult,
	InstagramMedia,
	InstagramNode,
} from "./types";

const InstagramNodeSchema: z.ZodType<InstagramNode> = z.lazy(() =>
	z.object({
		__typename: z.string(),
		display_url: z.url().optional(),
		edge_sidecar_to_children: z
			.object({
				edges: z.array(
					z.object({
						node: z.lazy(() => InstagramNodeSchema),
					}),
				),
			})
			.optional(),
		video_url: z.url().optional(),
	}),
);

const InstagramEmbedDataSchema = z.object({
	gql_data: z
		.object({
			shortcode_media: z.lazy(() => InstagramNodeSchema).optional(),
			xdt_shortcode_media: z.lazy(() => InstagramNodeSchema).optional(),
		})
		.optional(),
});

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
			headers: {
				accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"sec-fetch-dest": "document",
				"sec-fetch-mode": "navigate",
				"sec-fetch-site": "none",
				"user-agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
			},
			signal: AbortSignal.timeout(10_000),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: Failed to fetch embed page`);
		}

		const html = await response.text();

		let mediaList: InstagramMedia[] = [];
		let caption: string | undefined;

		// Try to extract from JSON data
		try {
			const embedData = extractEmbedData(html);
			const parsedEmbedData = InstagramEmbedDataSchema.safeParse(
				JSON.parse(embedData.contextJSON),
			);

			if (!parsedEmbedData.success) {
				logger.warn("Invalid embed data structure", {
					issues: parsedEmbedData.error.issues,
				});
				throw new Error("Invalid embed data structure");
			}

			const contextData = parsedEmbedData.data;

			const shortcodeMedia =
				contextData.gql_data?.xdt_shortcode_media ??
				contextData.gql_data?.shortcode_media;

			caption = shortcodeMedia?.edge_media_to_caption?.edges[0]?.node?.text;

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

		// Fallback to DOM regex parsing if JSON failed or returned empty
		if (mediaList.length === 0) {
			logger.debug("Attempting DOM parsing for Instagram media");
			try {
				const htmlResult = extractMediaFromHtml(html, logger);
				mediaList = htmlResult.mediaList;
				// Use HTML caption if we don't have one from JSON
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

// Extract embed data from HTML
function extractEmbedData(html: string) {
	const match = /"init",\s*\[\],\s*\[(.*?)\]\],/.exec(html);

	if (!match?.[1]) {
		throw new Error("Could not find embed data in HTML");
	}

	const embedDataRaw = JSON.parse(match[1]) as { contextJSON: string };

	if (!embedDataRaw.contextJSON) {
		throw new Error("Missing contextJSON in embed data");
	}

	return embedDataRaw;
}

//  Extract media items from shortcode media object
function extractMediaItems(
	shortcodeMedia: InstagramNode,
	logger: ExtractInstagramMediaOptions["logger"],
): InstagramMedia[] {
	// Handle carousel posts
	const carouselEdges = shortcodeMedia.edge_sidecar_to_children?.edges;

	if (carouselEdges?.length) {
		logger.debug("Carousel detected", { items: carouselEdges.length });
		return carouselEdges.map((edge) => createMediaItem(edge.node));
	}

	// Handle single media posts
	logger.debug("Single media detected", { type: shortcodeMedia.__typename });
	return [createMediaItem(shortcodeMedia)];
}

//  Create media item object
function createMediaItem(node: InstagramNode): InstagramMedia {
	const isVideo = node.__typename === "GraphVideo";

	return {
		thumbnail: node.display_url ?? "",
		type: isVideo ? "video" : "image",
		url: isVideo ? (node.video_url ?? "") : (node.display_url ?? ""),
	};
}

//  Parse HTML to find media if JSON method fails
function extractMediaFromHtml(
	html: string,
	logger: ExtractInstagramMediaOptions["logger"],
): { caption?: string; mediaList: InstagramMedia[] } {
	const media: InstagramMedia[] = [];
	let caption: string | undefined;

	const root = parse(html);

	// Extract caption without relying on unbounded regex.
	const captionDiv = root.querySelector(".Caption");
	if (captionDiv) {
		// Drop username and comments to leave only the caption text.
		captionDiv
			.querySelectorAll(".CaptionUsername, .CaptionComments")
			.forEach((node) => {
				node.remove();
			});
		const rawCaption = decodeHtmlEntities(captionDiv.text.trim());
		if (rawCaption) {
			caption = rawCaption;
			logger.debug("Extracted caption from HTML", { caption });
		}
	}

	// Try to find the main image in the embed via DOM.
	const embeddedImg = root.querySelector("img.EmbeddedMediaImage");
	let thumbnailUrl = embeddedImg?.getAttribute("src") ?? undefined;

	// Try to find higher resolution in srcset.
	const srcsetAttr = embeddedImg?.getAttribute("srcset");
	if (srcsetAttr) {
		const srcset = srcsetAttr;
		// Split by comma, find the one with highest width
		const sources = srcset.split(",").map((s) => {
			const [url, widthStr] = s.trim().split(" ");
			const width = widthStr ? Number.parseInt(widthStr) : 0;
			return { url, width };
		});
		// Sort by width descending
		sources.sort((a, b) => b.width - a.width);
		if (sources[0]?.url) {
			thumbnailUrl = sources[0].url;
		}
	}

	// Decode HTML entities in URL (e.g. &amp; -> &)
	const decodedThumbnail = thumbnailUrl
		? decodeHtmlEntities(thumbnailUrl)
		: undefined;

	// Try to extract video URL if this is a video post
	let videoUrl: string | undefined;

	// Check if it's likely a video (Reel/Video post)
	const isVideoPost =
		html.includes('data-media-type="GraphVideo"') ||
		html.includes("Sprite PlayButtonSprite");

	if (isVideoPost) {
		// Look for video_url in any script tags or data attributes
		const videoUrlPatterns = [
			// Look for video_url in JSON-like structures
			/"video_url"\s*:\s*"([^"]+\.mp4[^"]*)"/,
			// Look for direct .mp4 URLs from Instagram CDN
			/https:\/\/[^"'\s]*\.cdninstagram\.com[^"'\s]*\.mp4[^"'\s]*/,
			// Look for scontent video URLs
			/https:\/\/scontent[^"'\s]*\.mp4[^"'\s]*/,
		];

		for (const pattern of videoUrlPatterns) {
			const match = pattern.exec(html);
			if (match) {
				// Get the full match or the first capture group
				const potentialUrl = match[1] || match[0];
				// Decode HTML entities and unescape
				videoUrl = potentialUrl
					.replaceAll("&amp;", "&")
					.replaceAll(String.raw`\/`, "/")
					.replaceAll(String.raw`\u0026`, "&");
				break;
			}
		}

		// Look for <video> tag with src
		if (!videoUrl) {
			const videoTagMatch = /<video[^>]*src="([^"]+)"/.exec(html);
			if (videoTagMatch?.[1]) {
				videoUrl = videoTagMatch[1].replaceAll("&amp;", "&");
			}
		}

		// Look for <source> tag inside video
		if (!videoUrl) {
			const sourceTagMatch = /<source[^>]*src="([^"]+\.mp4[^"]*)"/.exec(html);
			if (sourceTagMatch?.[1]) {
				videoUrl = sourceTagMatch[1].replaceAll("&amp;", "&");
			}
		}
	}

	// Create media item based on what we found
	if (videoUrl && decodedThumbnail) {
		// We found both video and thumbnail
		logger.debug("Found video URL in HTML", { videoUrl });
		media.push({
			thumbnail: decodedThumbnail,
			type: "video",
			url: videoUrl,
		});
	} else if (decodedThumbnail) {
		// Only found thumbnail (image or video poster)
		if (isVideoPost) {
			logger.debug(
				"Video post detected but video URL not found in HTML, using thumbnail only",
			);
		}
		media.push({
			thumbnail: decodedThumbnail,
			type: "image",
			url: decodedThumbnail,
		});
	}

	return { caption, mediaList: media };
}

function decodeHtmlEntities(input: string) {
	return input
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#064;", "@");
}

// Heuristic classifier to avoid swallowing critical failures silently.
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
