import { z } from "zod";

import type {
	ExtractedTwitterMedia,
	ExtractionResult,
	ExtractTwitterMediaOptions,
	TwitterVideoVariant,
} from "./types";

const TwitterVideoVariantSchema = z.object({
	bitrate: z.number().optional(),
	content_type: z.string(),
	url: z.url(),
});

const TwitterMediaDetailsSchema = z.object({
	ext_alt_text: z.string().optional(),
	media_url_https: z.url(),
	type: z.enum(["photo", "video", "animated_gif"]),
	video_info: z
		.object({
			variants: z.array(TwitterVideoVariantSchema),
		})
		.optional(),
});

const TwitterSyndicationResponseSchema = z.object({
	__typename: z.literal("Tweet"),
	id_str: z.string(),
	mediaDetails: z.array(TwitterMediaDetailsSchema).optional(),
});

const TWITTER_SYNDICATION_API =
	"https://cdn.syndication.twimg.com/tweet-result";

/**
 * Extracts media URLs from Twitter post - simple and direct
 * @param {ExtractTwitterMediaOptions} options - Extraction options with URL and logger
 * @returns {Promise<ExtractionResult>} Result with extracted media or error
 */
export async function extractTwitterMediaUrls(
	options: ExtractTwitterMediaOptions,
): Promise<
	ExtractionResult<{ media: ExtractedTwitterMedia; method: "syndication" }>
> {
	const { logger, url } = options;

	// 1. Extract tweet ID
	const tweetId = extractTweetId(url);
	if (!tweetId) {
		return {
			error: "Invalid Twitter URL",
			recoverable: true,
			success: false,
		};
	}

	//  Fetch tweet data
	const response = await fetch(
		`${TWITTER_SYNDICATION_API}?id=${tweetId}&token=a`,
		{
			headers: {
				accept: "application/json",
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
			},
			signal: AbortSignal.timeout(5000),
		},
	);

	if (!response.ok) {
		logger.warn("Twitter syndication API request failed", {
			status: response.status,
			statusText: response.statusText,
			tweetId,
		});
		return {
			error: `Failed to fetch tweet: ${response.status} ${response.statusText}`,
			recoverable: true,
			success: false,
		};
	}

	const parseResult = TwitterSyndicationResponseSchema.safeParse(
		await response.json(),
	);
	if (!parseResult.success) {
		logger.warn("Invalid API response structure", { error: parseResult.error });
		return {
			error: "Invalid API response",
			recoverable: true,
			success: false,
		};
	}
	const data = parseResult.data;

	logger.debug("Fetched tweet data", { data });

	//  Extract media
	const media: ExtractedTwitterMedia = {
		gifs: [],
		images: [],
		videos: [],
	};

	if (!data.mediaDetails || data.mediaDetails.length === 0) {
		return { data: { media, method: "syndication" }, success: true };
	}

	// Process each media item
	for (const item of data.mediaDetails) {
		if (item.type === "photo") {
			media.images.push({
				altText: item.ext_alt_text,
				url: item.media_url_https,
			});
		} else if (item.type === "video" && item.video_info?.variants) {
			const videoUrl = getBestVideoUrl(item.video_info.variants);
			if (videoUrl) {
				media.videos.push(videoUrl);
			}
		} else if (item.type === "animated_gif" && item.video_info?.variants) {
			const gifUrl = getBestVideoUrl(item.video_info.variants);
			if (gifUrl) {
				media.gifs.push({
					thumbnail: item.media_url_https,
					url: gifUrl,
				});
			}
		}
	}

	logger.info("Extracted Twitter media", {
		gifs: media.gifs.length,
		images: media.images.length,
		videos: media.videos.length,
	});

	return { data: { media, method: "syndication" }, success: true };
}

function extractTweetId(url: string): null | string {
	try {
		const urlObj = new URL(url);

		// Validate hostname is Twitter/X
		const allowedHosts = [
			"twitter.com",
			"x.com",
			"www.twitter.com",
			"www.x.com",
			"mobile.twitter.com",
			"mobile.x.com",
		];
		if (!allowedHosts.includes(urlObj.hostname.toLowerCase())) {
			return null;
		}

		// Validate protocol
		if (urlObj.protocol !== "https:") {
			return null;
		}

		const statusMatch = /\/status\/(\d+)/.exec(urlObj.pathname);
		if (statusMatch?.[1]) {
			const tweetId = statusMatch[1];
			// Validate tweet ID length (Twitter IDs are max 19-20 digits)
			if (tweetId.length > 0 && tweetId.length <= 20) {
				return tweetId;
			}
		}
		return null;
	} catch {
		return null;
	}
}

function getBestVideoUrl(variants: TwitterVideoVariant[]): null | string {
	// Filter for MP4 videos only, sort by bitrate descending
	const mp4Videos = variants
		.filter((v) => v.content_type === "video/mp4" && v.bitrate)
		.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

	return mp4Videos[0]?.url ?? null;
}
