import type { ParsedTwitterUrl } from "./types";

/**
 * Valid Twitter domain patterns
 */
const TWITTER_DOMAINS = [
	"twitter.com",
	"x.com",
	"mobile.twitter.com",
	"mobile.x.com",
	"www.twitter.com",
	"www.x.com",
] as const;

/**
 * Extracts tweet ID from various Twitter URL formats
 *
 * Supports formats:
 * - https://twitter.com/user/status/1234567890
 * - https://x.com/user/status/1234567890
 * - https://twitter.com/i/web/status/1234567890
 * - https://mobile.twitter.com/user/status/1234567890
 *
 * @param {string} url - Twitter URL to parse
 * @returns {string | null} Tweet ID if found, null otherwise
 *
 * @example
 * extractTweetId('https://twitter.com/elonmusk/status/1234567890')
 * // Returns: '1234567890'
 */
export function extractTweetId(url: string): null | string {
	try {
		const urlObj = new URL(url);

		// Check if it's a Twitter domain
		if (!TWITTER_DOMAINS.some((domain) => urlObj.hostname.endsWith(domain))) {
			return null;
		}

		// Pattern 1: /status/1234567890
		const statusMatch = urlObj.pathname.match(/\/status\/(\d+)/);
		if (statusMatch?.[1]) {
			return statusMatch[1];
		}

		// Pattern 2: /i/web/status/1234567890
		const webStatusMatch = urlObj.pathname.match(/\/i\/web\/status\/(\d+)/);
		if (webStatusMatch?.[1]) {
			return webStatusMatch[1];
		}

		return null;
	} catch {
		// Invalid URL
		return null;
	}
}

/**
 * Checks if a URL is a valid Twitter/X tweet URL
 *
 * @param {string} url - URL to check
 * @returns {boolean} True if URL is a valid tweet URL
 *
 * @example
 * isTweetUrl('https://twitter.com/user/status/123')
 * // Returns: true
 *
 * isTweetUrl('https://twitter.com/user')
 * // Returns: false (profile URL, not tweet)
 */
export function isTweetUrl(url: string): boolean {
	return extractTweetId(url) !== null;
}

/**
 * Extracts username from Twitter URL if available
 *
 * @param {string} url - Twitter URL to parse
 * @returns {string | null} Username if found, null otherwise
 *
 * @example
 * extractUsername('https://twitter.com/elonmusk/status/123')
 * // Returns: 'elonmusk'
 */
export function extractUsername(url: string): null | string {
	try {
		const urlObj = new URL(url);

		// Check if it's a Twitter domain
		if (!TWITTER_DOMAINS.some((domain) => urlObj.hostname.endsWith(domain))) {
			return null;
		}

		// Pattern: /username/status/...
		const usernameMatch = urlObj.pathname.match(/^\/([^/]+)\/status\//);
		if (usernameMatch?.[1] && usernameMatch[1] !== "i") {
			return usernameMatch[1];
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Parses Twitter URL into structured components
 *
 * @param {string} url - Twitter URL to parse
 * @returns {ParsedTwitterUrl} Parsed URL components
 *
 * @example
 * parseTwitterUrl('https://twitter.com/user/status/123')
 * // Returns:
 * // {
 * //   tweetId: '123',
 * //   username: 'user',
 * //   originalUrl: 'https://twitter.com/user/status/123',
 * //   isValid: true
 * // }
 */
export function parseTwitterUrl(url: string): ParsedTwitterUrl {
	const tweetId = extractTweetId(url);
	const username = extractUsername(url);

	return {
		isValid: tweetId !== null,
		originalUrl: url,
		tweetId: tweetId ?? "",
		username: username ?? undefined,
	};
}

/**
 * Normalizes Twitter URL to canonical format
 * Converts x.com to twitter.com and removes unnecessary parameters
 *
 * @param {string} url - Twitter URL to normalize
 * @returns {string | null} Normalized URL or null if invalid
 *
 * @example
 * normalizeTwitterUrl('https://x.com/user/status/123?s=20')
 * // Returns: 'https://twitter.com/user/status/123'
 */
export function normalizeTwitterUrl(url: string): null | string {
	const parsed = parseTwitterUrl(url);

	if (!parsed.isValid) {
		return null;
	}

	// Use twitter.com as canonical domain
	const username = parsed.username ?? "i/web";
	return `https://twitter.com/${username}/status/${parsed.tweetId}`;
}

/**
 * Validates that a string is a valid tweet ID
 * Tweet IDs are numeric strings, typically 18-19 digits (Snowflake IDs)
 *
 * @param {string} id - Tweet ID to validate
 * @returns {boolean} True if valid tweet ID format
 *
 * @example
 * isValidTweetId('1234567890123456789')
 * // Returns: true
 *
 * isValidTweetId('abc123')
 * // Returns: false
 */
export function isValidTweetId(id: string): boolean {
	// Tweet IDs are numeric and typically 15-19 digits
	// First tweet ID: 20 (2006), current IDs are ~19 digits
	return /^\d{10,20}$/.test(id);
}

/**
 * Checks if URL is a Twitter/X domain (not necessarily a tweet)
 *
 * @param {string} url - URL to check
 * @returns {boolean} True if URL is from Twitter/X domain
 *
 * @example
 * isTwitterDomain('https://twitter.com/explore')
 * // Returns: true
 */
export function isTwitterDomain(url: string): boolean {
	try {
		const urlObj = new URL(url);
		return TWITTER_DOMAINS.some((domain) => urlObj.hostname.endsWith(domain));
	} catch {
		return false;
	}
}
