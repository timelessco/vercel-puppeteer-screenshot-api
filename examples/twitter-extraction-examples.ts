/**
 * Twitter Media Extraction - Example Usage and Test Cases
 *
 * This file demonstrates how to use the Twitter media extraction functionality
 * Run with: node --experimental-strip-types examples/twitter-extraction-examples.ts
 */

import { createLogger } from "../src/lib/puppeteer/core/createLogger";
import {
	extractBestTwitterVideoUrl,
	extractTwitterImageUrls,
	extractTwitterMediaUrls,
	extractTwitterVideoUrls,
	parseTwitterUrl,
} from "../src/lib/twitter";

// Create a simple logger for testing
const logger = createLogger({ headless: true, verbose: true });

/**
 * Example 1: Extract all media from a tweet
 */
async function example1_extractAllMedia() {
	console.log("\n=== Example 1: Extract All Media ===\n");

	const url = "https://twitter.com/username/status/1234567890";

	const result = await extractTwitterMediaUrls({
		logger,
		url,
	});

	if (result.success && result.media) {
		console.log("✓ Extraction successful!");
		console.log(`Method used: ${result.method}`);
		console.log(`\nTweet by: @${result.media.tweet.handle}`);
		console.log(`Tweet text: ${result.media.tweet.text}`);
		console.log(`\nVideos found: ${result.media.videos.length}`);
		for (const video of result.media.videos) {
			console.log(
				`  - ${video.quality} quality (${video.bitrate} bps): ${video.url}`,
			);
		}
		console.log(`\nImages found: ${result.media.images.length}`);
		for (const image of result.media.images) {
			console.log(`  - ${image.url}`);
		}
		console.log(`\nGIFs found: ${result.media.gifs.length}`);
		for (const gif of result.media.gifs) {
			console.log(`  - ${gif.url}`);
		}
	} else {
		console.log("✗ Extraction failed:", result.error);
	}
}

/**
 * Example 2: Extract only video URLs
 */
async function example2_extractVideosOnly() {
	console.log("\n=== Example 2: Extract Videos Only ===\n");

	const url = "https://twitter.com/username/status/1234567890";

	const videos = await extractTwitterVideoUrls({
		logger,
		preferredQuality: "high",
		url,
	});

	if (videos.length > 0) {
		console.log(`✓ Found ${videos.length} video(s):`);
		for (const video of videos) {
			console.log(`  - ${video.quality} quality: ${video.url.slice(0, 80)}...`);
		}
	} else {
		console.log("✗ No videos found");
	}
}

/**
 * Example 3: Get best quality video only
 */
async function example3_getBestVideo() {
	console.log("\n=== Example 3: Get Best Quality Video ===\n");

	const url = "https://twitter.com/username/status/1234567890";

	const bestVideo = await extractBestTwitterVideoUrl({
		logger,
		preferredQuality: "high",
		url,
	});

	if (bestVideo) {
		console.log("✓ Best video found:");
		console.log(`  Quality: ${bestVideo.quality}`);
		console.log(`  Bitrate: ${bestVideo.bitrate} bps`);
		console.log(`  URL: ${bestVideo.url.slice(0, 100)}...`);
	} else {
		console.log("✗ No video found");
	}
}

/**
 * Example 4: Extract only images
 */
async function example4_extractImagesOnly() {
	console.log("\n=== Example 4: Extract Images Only ===\n");

	const url = "https://twitter.com/username/status/1234567890";

	const images = await extractTwitterImageUrls({
		logger,
		url,
	});

	if (images.length > 0) {
		console.log(`✓ Found ${images.length} image(s):`);
		for (const image of images) {
			console.log(`  - ${image.url}`);
			if (image.altText) {
				console.log(`    Alt text: ${image.altText}`);
			}
		}
	} else {
		console.log("✗ No images found");
	}
}

/**
 * Example 5: Parse Twitter URL
 */
async function example5_parseUrl() {
	console.log("\n=== Example 5: Parse Twitter URLs ===\n");

	const urls = [
		"https://twitter.com/user/status/1234567890",
		"https://x.com/user/status/1234567890",
		"https://mobile.twitter.com/user/status/1234567890",
		"https://twitter.com/i/web/status/1234567890",
	];

	for (const url of urls) {
		const parsed = parseTwitterUrl(url);
		console.log(`\nURL: ${url}`);
		console.log(`  Valid: ${parsed.isValid}`);
		console.log(`  Tweet ID: ${parsed.tweetId}`);
		console.log(`  Username: ${parsed.username ?? "N/A"}`);
	}
}

/**
 * Test Cases for Different Tweet Types
 */
const TEST_CASES = {
	// Note: Replace these with actual tweet URLs for testing
	gifTweet: "https://twitter.com/username/status/GIF_TWEET_ID",
	imageTweet: "https://twitter.com/username/status/IMAGE_TWEET_ID",
	multipleImagesTweet:
		"https://twitter.com/username/status/MULTIPLE_IMAGES_TWEET_ID",
	textOnlyTweet: "https://twitter.com/username/status/TEXT_ONLY_TWEET_ID",
	videoTweet: "https://twitter.com/username/status/VIDEO_TWEET_ID",
};

/**
 * Run all examples
 */
async function runAllExamples() {
	console.log("\n╔════════════════════════════════════════════════════════╗");
	console.log("║  Twitter Media Extraction - Usage Examples            ║");
	console.log("╚════════════════════════════════════════════════════════╝");

	try {
		// Note: These examples will fail without valid tweet URLs
		// Replace the URLs in the functions above with real tweet URLs to test

		await example1_extractAllMedia();
		await example2_extractVideosOnly();
		await example3_getBestVideo();
		await example4_extractImagesOnly();
		await example5_parseUrl();

		console.log("\n✓ All examples completed!\n");
	} catch (error) {
		console.error("\n✗ Error running examples:", error);
	}
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
	runAllExamples();
}

/**
 * Integration with your existing screenshot code:
 *
 * ```typescript
 * import { getTwitterScreenshot } from '@/lib/puppeteer/screenshot/getTwitterScreenshot';
 * import { withBrowser } from '@/lib/puppeteer/core/withBrowser';
 *
 * // Get screenshot WITH media URLs (using Syndication API)
 * const result = await withBrowser(
 *   { url: 'https://twitter.com/user/status/123', logger, extractMediaUrls: true },
 *   getTwitterScreenshot
 * );
 *
 * if (result) {
 *   console.log('Screenshot size:', result.screenshot.length);
 *   console.log('Metadata:', result.metaData);
 *
 *   if (result.extractedMedia) {
 *     console.log('Video URLs:', result.extractedMedia.videos);
 *     console.log('Image URLs:', result.extractedMedia.images);
 *     console.log('Extraction method:', result.extractionMethod); // Always 'syndication'
 *   }
 * }
 * ```
 */
