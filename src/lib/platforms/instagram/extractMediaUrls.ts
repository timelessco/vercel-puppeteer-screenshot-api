import type { GetInstagramPostReelScreenshotOptions } from "@/lib/puppeteer/screenshot/getInstagramPostReelScreenshot";
import { getErrorMessage } from "@/utils/errorUtils";

import type {
	ExtractInstagramMediaResult,
	InstagramEmbedData,
	InstagramMedia,
	InstagramNode,
} from "./types";

export type ExtractInstagramMediaOptions = Pick<
	GetInstagramPostReelScreenshotOptions,
	"logger" | "url"
>;

export async function extractInstagramMediaUrls(
	options: ExtractInstagramMediaOptions,
): Promise<ExtractInstagramMediaResult> {
	const { logger, url } = options;

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
			const contextData = JSON.parse(
				embedData.contextJSON,
			) as InstagramEmbedData;

			const shortcodeMedia =
				contextData.gql_data?.xdt_shortcode_media ??
				contextData.gql_data?.shortcode_media;

			caption = shortcodeMedia?.edge_media_to_caption?.edges[0]?.node?.text;

			logger.debug("Extracted caption", { caption });
			if (shortcodeMedia) {
				mediaList = extractMediaItems(shortcodeMedia, logger);
			}
		} catch (error) {
			logger.debug("JSON extraction failed, trying fallback DOM parsing", {
				error: getErrorMessage(error),
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
				logger.error("Failed to extract media from HTML fallback", {
					error: getErrorMessage(error),
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

		throw new Error("No media found in embed data or HTML");
	} catch (error) {
		logger.error("Failed to extract media from Instagram embed", {
			error: getErrorMessage(error),
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

	// Try to extract caption from HTML
	// Look for <div class="Caption">...</div>
	const captionMatch =
		/<div class="Caption">([\s\S]*?)<div class="CaptionComments">/.exec(html);
	if (captionMatch?.[1]) {
		let captionHtml = captionMatch[1];
		// Remove the username link at the start
		captionHtml = captionHtml.replace(
			/<a class="CaptionUsername"[^>]*>.*?<\/a>/,
			"",
		);
		// Remove all HTML tags
		captionHtml = captionHtml.replaceAll(/<[^>]+>/g, "");
		// Decode HTML entities
		captionHtml = captionHtml
			.replaceAll("&amp;", "&")
			.replaceAll("&lt;", "<")
			.replaceAll("&gt;", ">")
			.replaceAll("&quot;", '"')
			.replaceAll("&#064;", "@");
		// Clean up whitespace
		caption = captionHtml.trim();
		if (caption) {
			logger.debug("Extracted caption from HTML", { caption });
		}
	}

	// Try to find the main image in the embed
	// Look for <img class="EmbeddedMediaImage" ... src="..." ...>
	const imgMatch = /<img[^>]*class="EmbeddedMediaImage"[^>]*src="([^"]+)"/.exec(
		html,
	);
	let thumbnailUrl = imgMatch?.[1];

	// Try to find higher resolution in srcset
	// srcset="url 640w, url 750w, ..."
	const srcsetMatch =
		/<img[^>]*class="EmbeddedMediaImage"[^>]*srcset="([^"]+)"/.exec(html);
	if (srcsetMatch?.[1]) {
		const srcset = srcsetMatch[1];
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
	const decodedThumbnail = thumbnailUrl?.replaceAll("&amp;", "&");

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
