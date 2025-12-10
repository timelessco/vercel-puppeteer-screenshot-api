import { getErrorMessage } from "@/utils/errorUtils";
import type { ScreenshotResult } from "@/app/try/route";

import type { WithBrowserOptions } from "../core/withBrowser";
import { fetchImageDirectly } from "./getImageScreenshot";

/**
 * Extracts Instagram image index from URL parameters
 * @param {string} url - The Instagram URL to parse
 * @returns {number | undefined} The image index if present, undefined otherwise
 */
function extractInstagramImageIndex(url: string): number | undefined {
	try {
		const urlObj = new URL(url);
		const imgIndexFromUrl = urlObj.searchParams.get("img_index");

		return imgIndexFromUrl ? Number.parseInt(imgIndexFromUrl) - 1 : undefined;
	} catch {
		return undefined;
	}
}

interface InstagramMedia {
	height?: number;
	thumbnail?: string;
	type: "image" | "video";
	url: string;
	width?: number;
}

interface InstagramNode {
	__typename: string;
	dimensions?: {
		height: number;
		width: number;
	};
	display_url?: string;
	edge_sidecar_to_children?: {
		edges: Array<{
			node: InstagramNode;
		}>;
	};
	video_url?: string;
}

interface InstagramEmbedData {
	gql_data?: {
		shortcode_media?: InstagramNode;
		xdt_shortcode_media?: InstagramNode;
	};
}

type GetInstagramPostReelScreenshotOptions = WithBrowserOptions;

/**
 * Captures screenshot from Instagram posts with special handling for carousels and images
 * @param {GetInstagramPostReelScreenshotOptions} options - Options containing browser, url, logger, and metrics flag
 * @returns {Promise<ScreenshotResult | null>} Screenshot buffer with metadata or null if not an Instagram URL
 */
export async function getInstagramPostReelScreenshot(
	options: GetInstagramPostReelScreenshotOptions,
): Promise<null | ScreenshotResult> {
	const { logger, url } = options;

	try {
		logger.info("Instagram POST or REEL detected");

		const media = await extractMediaFromEmbed(url);
		console.log("Extracted media:", media);

		const results = await Promise.allSettled(
			media.map((m) =>
				fetchImageDirectly({ ...options, url: m.thumbnail ?? "" }),
			),
		);

		const allImages: Buffer[] = results.map((result) => {
			if (result.status === "fulfilled") {
				return result.value;
			}

			return Buffer.alloc(0);
		});

		const allVideos = media.filter((m) => m.type === "video").map((m) => m.url);

		const imageIndex = extractInstagramImageIndex(url);

		const screenshot = allImages[imageIndex ?? 0];

		return {
			allImages,
			allVideos,
			metaData: null,
			screenshot,
		};
	} catch (error) {
		logger.warn("Instagram screenshot failed, returning null for fallback", {
			error: getErrorMessage(error),
		});

		return null;
	}
}

async function extractMediaFromEmbed(url: string): Promise<InstagramMedia[]> {
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
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: Failed to fetch embed page`);
		}

		const html = await response.text();

		let mediaList: InstagramMedia[] = [];

		// Method 1: Try to extract from JSON data (legacy and some current embeds)
		try {
			const embedData = extractEmbedData(html);
			const contextData = JSON.parse(
				embedData.contextJSON,
			) as InstagramEmbedData;

			const shortcodeMedia =
				contextData.gql_data?.xdt_shortcode_media ??
				contextData.gql_data?.shortcode_media;

			if (shortcodeMedia) {
				mediaList = extractMediaItems(shortcodeMedia);
			}
		} catch (error) {
			console.log(
				"JSON extraction failed, trying fallback DOM parsing",
				getErrorMessage(error),
			);
		}

		// Method 2: Fallback to DOM regex parsing if JSON failed or returned empty
		if (mediaList.length === 0) {
			console.log("Attempting DOM parsing for Instagram media...");
			mediaList = extractMediaFromHtml(html);
		}

		if (mediaList.length > 0) {
			console.log(
				`✓ Extracted ${mediaList.length} media item(s) from ${shortcode}`,
			);
			return mediaList;
		}

		throw new Error("No media found in embed data or HTML");
	} catch (error) {
		console.error("Failed to extract media from Instagram embed:", error);
		return [];
	}
}

// Helper: Extract embed data from HTML
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

// Helper: Extract media items from shortcode media object
function extractMediaItems(shortcodeMedia: InstagramNode): InstagramMedia[] {
	// Handle carousel posts
	const carouselEdges = shortcodeMedia.edge_sidecar_to_children?.edges;

	if (carouselEdges?.length) {
		console.log(`→ Carousel detected: ${carouselEdges.length} items`);
		return carouselEdges.map((edge) => createMediaItem(edge.node));
	}

	// Handle single media posts
	console.log(`→ Single media: ${shortcodeMedia.__typename}`);
	return [createMediaItem(shortcodeMedia)];
}

// Helper: Create media item object
function createMediaItem(node: InstagramNode): InstagramMedia {
	const isVideo = node.__typename === "GraphVideo";

	return {
		height: node.dimensions?.height,
		thumbnail: node.display_url ?? "",
		type: isVideo ? "video" : "image",
		url: isVideo ? (node.video_url ?? "") : (node.display_url ?? ""),
		width: node.dimensions?.width,
	};
}

// Helper: Parse HTML to find media if JSON method fails
function extractMediaFromHtml(html: string): InstagramMedia[] {
	const media: InstagramMedia[] = [];

	// 1. Try to find the main image in the embed
	// Look for <img class="EmbeddedMediaImage" ... src="..." ...>
	const imgMatch = /<img[^>]*class="EmbeddedMediaImage"[^>]*src="([^"]+)"/.exec(
		html,
	);
	let thumbnailUrl = imgMatch?.[1];

	// 2. Try to find higher resolution in srcset
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

	// 3. Try to extract video URL if this is a video post
	let videoUrl: string | undefined;

	// Check if it's likely a video (Reel/Video post)
	const isVideoPost =
		html.includes('data-media-type="GraphVideo"') ||
		html.includes("Sprite PlayButtonSprite");

	if (isVideoPost) {
		// Strategy 1: Look for video_url in any script tags or data attributes
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

		// Strategy 2: Look for <video> tag with src
		if (!videoUrl) {
			const videoTagMatch = /<video[^>]*src="([^"]+)"/.exec(html);
			if (videoTagMatch?.[1]) {
				videoUrl = videoTagMatch[1].replaceAll("&amp;", "&");
			}
		}

		// Strategy 3: Look for <source> tag inside video
		if (!videoUrl) {
			const sourceTagMatch = /<source[^>]*src="([^"]+\.mp4[^"]*)"/.exec(html);
			if (sourceTagMatch?.[1]) {
				videoUrl = sourceTagMatch[1].replaceAll("&amp;", "&");
			}
		}
	}

	// 4. Create media item based on what we found
	if (videoUrl && decodedThumbnail) {
		// We found both video and thumbnail
		media.push({
			thumbnail: decodedThumbnail,
			type: "video",
			url: videoUrl,
		});
	} else if (decodedThumbnail) {
		// Only found thumbnail (image or video poster)
		media.push({
			thumbnail: decodedThumbnail,
			type: "image",
			url: decodedThumbnail,
		});
	}

	return media;
}
