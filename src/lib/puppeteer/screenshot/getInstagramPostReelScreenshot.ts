/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

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
	thumbnail?: string;
	type: "image" | "video";
	url: string;
}

interface InstagramEmbedData {
	gql_data?: {
		shortcode_media?: {
			__typename?: string;
			display_url?: string;
			edge_sidecar_to_children?: {
				edges: Array<{
					node: {
						__typename: string;
						display_url?: string;
						video_url?: string;
					};
				}>;
			};
			video_url?: string;
		};
		xdt_shortcode_media?: {
			__typename?: string;
			display_url?: string;
			edge_sidecar_to_children?: {
				edges: Array<{
					node: {
						__typename: string;
						display_url?: string;
						video_url?: string;
					};
				}>;
			};
			video_url?: string;
		};
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
		console.log("!!@#!@#!@#!@#!@media", media);

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
		// Extract shortcode from URL
		// Supports /p/SHORTCODE and /reel/SHORTCODE
		const match = /(?:p|reel)\/([\w-]+)/.exec(url);
		const shortcode = match ? match[1] : null;

		if (!shortcode) {
			console.error("Could not extract shortcode from URL");
			return [];
		}

		// Fetch the embed page HTML
		const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
		const response = await fetch(embedUrl, {
			headers: {
				accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
				"sec-fetch-dest": "document",
				"sec-fetch-mode": "navigate",
				"sec-fetch-site": "none",
				"upgrade-insecure-requests": "1",
				"user-agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
			},
		});

		if (!response.ok) {
			console.error(`Failed to fetch embed page: ${response.status}`);
			return [];
		}

		const html = await response.text();

		// Extract the embedded JSON data
		const embedDataMatch = /"init",\[\],\[(.*?)\]\],/.exec(html);
		if (!embedDataMatch?.[1]) {
			console.error("Could not find embed data in HTML");
			return [];
		}

		const embedDataRaw = JSON.parse(embedDataMatch[1]);

		if (!embedDataRaw?.contextJSON) {
			console.error("No contextJSON in embed data");
			return [];
		}

		// Parse the contextJSON which contains the actual media data
		const contextData = JSON.parse(
			embedDataRaw.contextJSON as string,
		) as InstagramEmbedData;

		// Extract media from gql_data
		const shortcodeMedia =
			contextData.gql_data?.xdt_shortcode_media ??
			contextData.gql_data?.shortcode_media;

		if (!shortcodeMedia) {
			console.error("No shortcode media found in context data");
			return [];
		}

		const mediaList: InstagramMedia[] = [];

		// Check if it's a carousel (multiple images/videos)
		if (shortcodeMedia.edge_sidecar_to_children?.edges) {
			console.log(
				"!!@#!@#!@#!@#!@Carousel detected with",
				shortcodeMedia.edge_sidecar_to_children.edges.length,
				"items",
			);

			// Extract all carousel items
			for (const edge of shortcodeMedia.edge_sidecar_to_children.edges) {
				const node = edge.node;
				const isVideo = node.__typename === "GraphVideo";

				mediaList.push({
					thumbnail: node.display_url,
					type: isVideo ? "video" : "image",
					url: isVideo ? (node.video_url ?? "") : (node.display_url ?? ""),
				});
			}
		} else {
			// Single image or video post
			const isVideo = shortcodeMedia.__typename === "GraphVideo";
			console.log(
				"!!@#!@#!@#!@#!@Single media detected, type:",
				shortcodeMedia.__typename,
			);

			mediaList.push({
				thumbnail: shortcodeMedia.display_url,
				type: isVideo ? "video" : "image",
				url: isVideo
					? (shortcodeMedia.video_url ?? "")
					: (shortcodeMedia.display_url ?? ""),
			});
		}

		console.log("!!@#!@#!@#!@#!@Extracted", mediaList.length, "media items");
		return mediaList;
	} catch (error) {
		console.error("Error extracting media from embed", error);
		return [];
	}
}
