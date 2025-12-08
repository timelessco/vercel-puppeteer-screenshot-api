import type { ProcessedVideo, TwitterVideoVariant } from "./types";

/**
 * Quality thresholds for video classification (in bps)
 */
const QUALITY_THRESHOLDS = {
	HIGH: 1_000_000, // >= 1 Mbps is considered high quality
	MEDIUM: 500_000, // >= 500 kbps is considered medium quality
	// < 500 kbps is considered low quality
} as const;

/**
 * Determines quality label based on bitrate
 * @param {number} bitrate - Bitrate in bps (bits per second)
 * @returns {'high' | 'medium' | 'low'} Quality label
 * @example
 * getQualityLabel(2176000) // Returns: 'high'
 * getQualityLabel(832000)  // Returns: 'medium'
 * getQualityLabel(288000)  // Returns: 'low'
 */
function getQualityLabel(bitrate: number): "high" | "low" | "medium" {
	if (bitrate >= QUALITY_THRESHOLDS.HIGH) return "high";
	if (bitrate >= QUALITY_THRESHOLDS.MEDIUM) return "medium";
	return "low";
}

/**
 * Filters video variants to only include MP4 videos with bitrate
 * Excludes HLS streams (m3u8) and variants without bitrate
 * @param {TwitterVideoVariant[]} variants - Array of video variants from Twitter API
 * @returns {TwitterVideoVariant[]} Filtered array of valid MP4 variants
 */
function filterValidVariants(
	variants: TwitterVideoVariant[],
): TwitterVideoVariant[] {
	return variants.filter((variant) => {
		// Must be MP4 format
		const isMP4 = variant.content_type === "video/mp4";
		// Must have bitrate
		const hasBitrate = variant.bitrate !== undefined;
		// Must have valid URL
		const hasUrl = variant.url && variant.url.length > 0;

		return isMP4 && hasBitrate && hasUrl;
	});
}

/**
 * Processes video variants into structured format with quality labels
 * @param {TwitterVideoVariant[]} variants - Raw video variants from Twitter API
 * @returns {ProcessedVideo[]} Array of processed videos sorted by quality (high to low)
 * @example
 * const variants = [
 *   { url: 'video1.mp4', bitrate: 2176000, content_type: 'video/mp4' },
 *   { url: 'video2.mp4', bitrate: 832000, content_type: 'video/mp4' },
 * ];
 * processVideoVariants(variants)
 * // Returns:
 * // [
 * //   { url: 'video1.mp4', quality: 'high', bitrate: 2176000, contentType: 'video/mp4' },
 * //   { url: 'video2.mp4', quality: 'medium', bitrate: 832000, contentType: 'video/mp4' }
 * // ]
 */
export function processVideoVariants(
	variants: TwitterVideoVariant[],
): ProcessedVideo[] {
	const validVariants = filterValidVariants(variants);

	return validVariants
		.map((variant) => ({
			bitrate: variant.bitrate ?? 0,
			contentType: variant.content_type,
			quality: getQualityLabel(variant.bitrate ?? 0),
			url: variant.url,
		}))
		.sort((a, b) => b.bitrate - a.bitrate); // Sort by bitrate descending (high to low)
}

/**
 * Selects the best video URL based on preferred quality
 * Falls back to next best available quality if preferred is not available
 * @param {TwitterVideoVariant[]} variants - Array of video variants
 * @param {('high' | 'medium' | 'low')} [preferredQuality] - Preferred video quality
 * @returns {ProcessedVideo | null} Best matching video or null if no valid videos
 * @example
 * const variants = [...];
 * selectBestVideo(variants, 'high')
 * // Returns the highest quality MP4 video available
 */
export function selectBestVideo(
	variants: TwitterVideoVariant[],
	preferredQuality: "high" | "low" | "medium" = "high",
): null | ProcessedVideo {
	const processed = processVideoVariants(variants);

	if (processed.length === 0) {
		return null;
	}

	// Try to find exact quality match
	const exactMatch = processed.find((v) => v.quality === preferredQuality);
	if (exactMatch) {
		return exactMatch;
	}

	// Fallback strategy based on preferred quality
	if (preferredQuality === "high") {
		// If high not available, try medium, then low
		return (
			processed.find((v) => v.quality === "medium") ??
			processed.find((v) => v.quality === "low") ??
			processed[0]
		);
	}

	if (preferredQuality === "medium") {
		// If medium not available, try high, then low
		return (
			processed.find((v) => v.quality === "high") ??
			processed.find((v) => v.quality === "low") ??
			processed[0]
		);
	}

	// For low quality preference
	// If low not available, try medium, then high
	return (
		processed.find((v) => v.quality === "medium") ??
		processed.find((v) => v.quality === "high") ??
		processed[0]
	);
}

/**
 * Gets all available video qualities for a tweet
 * Useful for providing users with quality options
 * @param {TwitterVideoVariant[]} variants - Array of video variants
 * @returns {ProcessedVideo[]} All available videos sorted by quality
 */
export function getAllVideoQualities(
	variants: TwitterVideoVariant[],
): ProcessedVideo[] {
	return processVideoVariants(variants);
}

/**
 * Gets video quality statistics
 * Useful for logging and debugging
 * @param {TwitterVideoVariant[]} variants - Array of video variants
 * @returns {object} Statistics about available video qualities
 * @example
 * getVideoQualityStats(variants)
 * // Returns:
 * // {
 * //   totalVariants: 3,
 * //   validVariants: 3,
 * //   highQuality: 1,
 * //   mediumQuality: 1,
 * //   lowQuality: 1,
 * //   maxBitrate: 2176000,
 * //   minBitrate: 288000
 * // }
 */
export function getVideoQualityStats(variants: TwitterVideoVariant[]): {
	highQuality: number;
	lowQuality: number;
	maxBitrate: number;
	mediumQuality: number;
	minBitrate: number;
	totalVariants: number;
	validVariants: number;
} {
	const processed = processVideoVariants(variants);

	return {
		highQuality: processed.filter((v) => v.quality === "high").length,
		lowQuality: processed.filter((v) => v.quality === "low").length,
		maxBitrate: processed.length > 0 ? processed[0].bitrate : 0,
		mediumQuality: processed.filter((v) => v.quality === "medium").length,
		minBitrate: processed.length > 0 ? (processed.at(-1)?.bitrate ?? 0) : 0,
		totalVariants: variants.length,
		validVariants: processed.length,
	};
}
