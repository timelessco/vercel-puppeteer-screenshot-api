import type {
	ExtractedTwitterMedia,
	ExtractionResult,
	ExtractTwitterMediaOptions,
	ProcessedGif,
	ProcessedImage,
	ProcessedVideo,
	TwitterSyndicationResponse,
} from "./types";
import { extractTweetId, isValidTweetId } from "./urlUtils";
import { processVideoVariants, selectBestVideo } from "./videoQuality";

/**
 * Twitter Syndication API endpoint
 * This is a public API used by Twitter for embedding tweets
 * No authentication required
 */
const SYNDICATION_API_BASE = "https://cdn.syndication.twimg.com/tweet-result";

/**
 * Fetches tweet data from Twitter's Syndication API
 * This API is used by Twitter's embed functionality and doesn't require authentication
 * @param {string} tweetId - Tweet ID to fetch
 * @param {ExtractTwitterMediaOptions['logger']} logger - Logger instance
 * @returns {Promise<TwitterSyndicationResponse | null>} Tweet data or null if failed
 */
async function fetchTweetSyndication(
	tweetId: string,
	logger: ExtractTwitterMediaOptions["logger"],
): Promise<null | TwitterSyndicationResponse> {
	try {
		// The token parameter seems to be required but the value doesn't matter
		// Using 'a' as a placeholder works fine
		const url = `${SYNDICATION_API_BASE}?id=${tweetId}&token=a`;

		logger.debug("Fetching tweet from Syndication API", { tweetId, url });

		const response = await fetch(url, {
			headers: {
				accept: "application/json",
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
		});

		if (!response.ok) {
			logger.warn("Syndication API request failed", {
				status: response.status,
				statusText: response.statusText,
				tweetId,
			});
			return null;
		}

		const data = (await response.json()) as TwitterSyndicationResponse;

		logger.info("Successfully fetched tweet from Syndication API", {
			hasMedia: Boolean(data.mediaDetails && data.mediaDetails.length > 0),
			mediaCount: data.mediaDetails?.length ?? 0,
			tweetId,
		});

		return data;
	} catch (error) {
		logger.error("Error fetching from Syndication API", {
			error: error instanceof Error ? error.message : String(error),
			tweetId,
		});
		return null;
	}
}

/**
 * Processes media from syndication response into structured format
 * @param {TwitterSyndicationResponse} tweetData - Raw tweet data from API
 * @param {ExtractTwitterMediaOptions} options - Extraction options
 * @returns {ExtractedTwitterMedia} Processed media URLs
 */
function processMediaFromSyndication(
	tweetData: TwitterSyndicationResponse,
	options: ExtractTwitterMediaOptions,
): ExtractedTwitterMedia {
	const { logger, preferredQuality = "high" } = options;

	const videos: ProcessedVideo[] = [];
	const images: ProcessedImage[] = [];
	const gifs: ProcessedGif[] = [];

	if (!tweetData.mediaDetails || tweetData.mediaDetails.length === 0) {
		logger.debug("No media found in tweet");
		return {
			gifs,
			images,
			tweet: {
				author: tweetData.user.name,
				handle: tweetData.user.screen_name,
				id: tweetData.id_str,
				text: tweetData.text,
			},
			videos,
		};
	}

	// Process each media item
	for (const media of tweetData.mediaDetails) {
		if (media.type === "photo") {
			// Handle images
			images.push({
				altText: media.ext_alt_text,
				url: media.media_url_https,
			});

			logger.debug("Found image", { url: media.media_url_https });
		} else if (media.type === "video" && media.video_info?.variants) {
			// Handle videos
			const processedVariants = processVideoVariants(media.video_info.variants);

			// Add all video qualities
			videos.push(...processedVariants);

			const bestVideo = selectBestVideo(
				media.video_info.variants,
				preferredQuality,
			);

			logger.debug("Found video", {
				bestQuality: bestVideo?.quality,
				qualities: processedVariants.map((v) => v.quality),
			});
		} else if (media.type === "animated_gif" && media.video_info?.variants) {
			// Handle GIFs (Twitter converts GIFs to MP4)
			const bestGif = selectBestVideo(media.video_info.variants, "high");

			if (bestGif) {
				gifs.push({
					thumbnail: media.media_url_https,
					url: bestGif.url,
				});

				logger.debug("Found GIF", { url: bestGif.url });
			}
		}
	}

	logger.info("Processed media from tweet", {
		gifsCount: gifs.length,
		imagesCount: images.length,
		videosCount: videos.length,
	});

	logger.info("in extractMediaUrls", {
		gifs,
		images,
		tweet: {
			author: tweetData.user.name,
			handle: tweetData.user.screen_name,
			id: tweetData.id_str,
			text: tweetData.text,
		},
		videos,
	});

	return {
		gifs,
		images,
		tweet: {
			author: tweetData.user.name,
			handle: tweetData.user.screen_name,
			id: tweetData.id_str,
			text: tweetData.text,
		},
		videos,
	};
}

/**
 * Extracts media URLs from a Twitter post using the Syndication API
 * This is the primary method - fast, reliable, no auth required
 * @param {ExtractTwitterMediaOptions} options - Extraction options
 * @returns {Promise<ExtractionResult>} Extraction result with media URLs or error
 * @example
 * const result = await extractTwitterMediaUrls({
 *   url: 'https://twitter.com/user/status/1234567890',
 *   logger: console,
 *   preferredQuality: 'high'
 * });
 *
 * if (result.success && result.media) {
 *   console.log('Videos:', result.media.videos);
 *   console.log('Images:', result.media.images);
 * }
 */
export async function extractTwitterMediaUrls(
	options: ExtractTwitterMediaOptions,
): Promise<ExtractionResult> {
	const { logger, url } = options;

	logger.info("Starting Twitter media extraction", { url });

	// Step 1: Extract tweet ID from URL
	const tweetId = extractTweetId(url);

	if (!tweetId) {
		logger.error("Could not extract tweet ID from URL", { url });
		return {
			error: "Invalid Twitter URL - could not extract tweet ID",
			method: "syndication",
			success: false,
		};
	}

	// Step 2: Validate tweet ID format
	if (!isValidTweetId(tweetId)) {
		logger.error("Invalid tweet ID format", { tweetId });
		return {
			error: "Invalid tweet ID format",
			method: "syndication",
			success: false,
		};
	}

	logger.debug("Extracted tweet ID", { tweetId });

	// Step 3: Fetch tweet data from Syndication API
	const tweetData = await fetchTweetSyndication(tweetId, logger);

	if (!tweetData) {
		return {
			error: "Failed to fetch tweet data from Syndication API",
			method: "syndication",
			success: false,
		};
	}

	// Step 4: Process media from response
	const media = processMediaFromSyndication(tweetData, options);

	// Step 5: Check if any media was found
	const hasMedia =
		media.videos.length > 0 || media.images.length > 0 || media.gifs.length > 0;

	if (!hasMedia) {
		logger.info("No media found in tweet", { tweetId });
		return {
			error: "No media found in tweet",
			media,
			method: "syndication",
			success: false,
		};
	}

	logger.info("Successfully extracted Twitter media", {
		gifs: media.gifs.length,
		images: media.images.length,
		tweetId,
		videos: media.videos.length,
	});

	return {
		media,
		method: "syndication",
		success: true,
	};
}

/**
 * Convenience function to get only video URLs from a tweet
 * @param {ExtractTwitterMediaOptions} options - Extraction options
 * @returns {Promise<ProcessedVideo[]>} Array of video URLs with quality info
 */
export async function extractTwitterVideoUrls(
	options: ExtractTwitterMediaOptions,
): Promise<ProcessedVideo[]> {
	const result = await extractTwitterMediaUrls(options);

	if (result.success && result.media) {
		return result.media.videos;
	}

	return [];
}

/**
 * Convenience function to get only image URLs from a tweet
 * @param {ExtractTwitterMediaOptions} options - Extraction options
 * @returns {Promise<ProcessedImage[]>} Array of image URLs
 */
export async function extractTwitterImageUrls(
	options: ExtractTwitterMediaOptions,
): Promise<ProcessedImage[]> {
	const result = await extractTwitterMediaUrls(options);

	if (result.success && result.media) {
		return result.media.images;
	}

	return [];
}

/**
 * Convenience function to get the best quality video URL from a tweet
 * @param {ExtractTwitterMediaOptions} options - Extraction options
 * @returns {Promise<ProcessedVideo | null>} Best quality video or null
 */
export async function extractBestTwitterVideoUrl(
	options: ExtractTwitterMediaOptions,
): Promise<null | ProcessedVideo> {
	const videos = await extractTwitterVideoUrls(options);

	if (videos.length === 0) {
		return null;
	}

	// Videos are already sorted by quality (high to low)
	// Return based on preferred quality
	const preferredQuality = options.preferredQuality ?? "high";

	const exactMatch = videos.find((v) => v.quality === preferredQuality);
	if (exactMatch) {
		return exactMatch;
	}

	// Return highest quality as fallback
	return videos[0];
}
