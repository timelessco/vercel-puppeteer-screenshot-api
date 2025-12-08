/**
 * Twitter Media Extraction Module
 *
 * This module provides utilities to extract media URLs (videos, images, GIFs)
 * from Twitter/X posts using the Twitter Syndication API.
 * @example Basic usage
 * ```typescript
 * import { extractTwitterMediaUrls } from '@/lib/twitter';
 *
 * const result = await extractTwitterMediaUrls({
 *   url: 'https://twitter.com/user/status/1234567890',
 *   logger: console
 * });
 *
 * if (result.success) {
 *   console.log(result.media.videos);
 * }
 * ```
 */

// Main extraction functions (Syndication API only)
export {
	extractBestTwitterVideoUrl,
	extractTwitterImageUrls,
	extractTwitterMediaUrls,
	extractTwitterVideoUrls,
} from "./extractMediaUrls";

// URL utilities
export {
	extractTweetId,
	extractUsername,
	isTweetUrl,
	isTwitterDomain,
	isValidTweetId,
	normalizeTwitterUrl,
	parseTwitterUrl,
} from "./urlUtils";

// Video quality utilities
export {
	getAllVideoQualities,
	getVideoQualityStats,
	processVideoVariants,
	selectBestVideo,
} from "./videoQuality";

// Types
export type {
	ExtractedTwitterMedia,
	ExtractionResult,
	ExtractTwitterMediaOptions,
	ParsedTwitterUrl,
	ProcessedGif,
	ProcessedImage,
	ProcessedVideo,
	TwitterMediaDetails,
	TwitterSyndicationResponse,
	TwitterUser,
	TwitterVideoVariant,
} from "./types";
