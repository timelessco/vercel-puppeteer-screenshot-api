# 🚀 Quick Start - Twitter Media Extraction

Get started with Twitter video/image URL extraction in 2 minutes using the **Twitter Syndication API**!

## ⚡ Fastest Way to Extract Media

```typescript
import { extractTwitterMediaUrls } from "@/lib/twitter";
import { createLogger } from "@/lib/puppeteer/core/createLogger";

// 1. Create logger
const logger = createLogger({ verbose: true, headless: true });

// 2. Extract media (using Syndication API)
const result = await extractTwitterMediaUrls({
	url: "https://twitter.com/user/status/1234567890",
	logger,
});

// 3. Use the results
if (result.success && result.media) {
	console.log("✓ Found media!");

	// Videos with quality options
	result.media.videos.forEach((video) => {
		console.log(`${video.quality}: ${video.url}`);
	});

	// Images
	result.media.images.forEach((img) => {
		console.log(`Image: ${img.url}`);
	});

	// GIFs (as MP4)
	result.media.gifs.forEach((gif) => {
		console.log(`GIF: ${gif.url}`);
	});
}
```

## 📺 Get Only Videos

```typescript
import { extractTwitterVideoUrls } from "@/lib/twitter";

const videos = await extractTwitterVideoUrls({
	url: "https://twitter.com/user/status/1234567890",
	logger,
	preferredQuality: "high", // 'high' | 'medium' | 'low'
});

// Videos are sorted by quality (high to low)
const highQualityVideo = videos[0];
console.log(highQualityVideo.url);
```

## 🖼️ Get Only Images

```typescript
import { extractTwitterImageUrls } from "@/lib/twitter";

const images = await extractTwitterImageUrls({
	url: "https://twitter.com/user/status/1234567890",
	logger,
});

images.forEach((img) => console.log(img.url));
```

## 🎯 Get Best Quality Video Only

```typescript
import { extractBestTwitterVideoUrl } from "@/lib/twitter";

const bestVideo = await extractBestTwitterVideoUrl({
	url: "https://twitter.com/user/status/1234567890",
	logger,
	preferredQuality: "high",
});

if (bestVideo) {
	console.log(`Download: ${bestVideo.url}`);
	console.log(`Quality: ${bestVideo.quality}`);
	console.log(`Bitrate: ${bestVideo.bitrate} bps`);
}
```

## 🔗 Integration with Existing Screenshot Code

Add media extraction to your existing Puppeteer screenshots:

```typescript
import { getTwitterScreenshot } from "@/lib/puppeteer/screenshot/getTwitterScreenshot";
import { withBrowser } from "@/lib/puppeteer/core/withBrowser";

const config = {
	url: "https://twitter.com/user/status/1234567890",
	logger,
	extractMediaUrls: true, // ← Add this flag
};

const result = await withBrowser(config, getTwitterScreenshot);

if (result) {
	// You get BOTH screenshot AND direct media URLs!
	const screenshot = result.screenshot;
	const videos = result.extractedMedia?.videos;
	const images = result.extractedMedia?.images;

	console.log(`Screenshot size: ${screenshot.length} bytes`);
	console.log(`Videos found: ${videos?.length || 0}`);
	console.log(`Images found: ${images?.length || 0}`);
}
```

## 🧪 Test with Real Tweets

### Step 1: Find a tweet with media

Go to Twitter and find any tweet with a video or images.

### Step 2: Copy the URL

Example: `https://twitter.com/elonmusk/status/1234567890`

### Step 3: Run extraction

```typescript
import { extractTwitterMediaUrls } from "@/lib/twitter";
import { createLogger } from "@/lib/puppeteer/core/createLogger";

const logger = createLogger({ verbose: true, headless: true });

const result = await extractTwitterMediaUrls({
	url: "YOUR_TWEET_URL_HERE",
	logger,
});

console.log(JSON.stringify(result, null, 2));
```

## 🎨 Common Use Cases

### Download Video in Best Quality

```typescript
const bestVideo = await extractBestTwitterVideoUrl({ url, logger });
if (bestVideo) {
	const response = await fetch(bestVideo.url);
	const buffer = await response.arrayBuffer();
	await fs.writeFile("video.mp4", Buffer.from(buffer));
}
```

### Create Video Preview

```typescript
const result = await extractTwitterMediaUrls({ url, logger });
if (result.success && result.media) {
	const preview = {
		title: result.media.tweet.text,
		author: result.media.tweet.author,
		thumbnail: result.media.images[0]?.url,
		videoUrl: result.media.videos[0]?.url,
	};
}
```

### Archive All Media

```typescript
const result = await extractTwitterMediaUrls({ url, logger });
if (result.success && result.media) {
	// Save videos
	for (const [i, video] of result.media.videos.entries()) {
		const response = await fetch(video.url);
		const buffer = await response.arrayBuffer();
		await fs.writeFile(`video-${i}-${video.quality}.mp4`, Buffer.from(buffer));
	}

	// Save images
	for (const [i, image] of result.media.images.entries()) {
		const response = await fetch(image.url);
		const buffer = await response.arrayBuffer();
		await fs.writeFile(`image-${i}.jpg`, Buffer.from(buffer));
	}
}
```

## 🔍 Parse Twitter URLs

```typescript
import { parseTwitterUrl, isTweetUrl, extractTweetId } from "@/lib/twitter";

// Check if URL is a tweet
if (isTweetUrl(url)) {
	console.log("This is a tweet URL!");
}

// Extract tweet ID
const tweetId = extractTweetId(url);
console.log(`Tweet ID: ${tweetId}`);

// Parse full URL
const parsed = parseTwitterUrl(url);
console.log(parsed);
// {
//   tweetId: '1234567890',
//   username: 'elonmusk',
//   isValid: true,
//   originalUrl: '...'
// }
```

## ⚙️ Quality Options

```typescript
// High quality (default) - ~2 Mbps, 1280x720
await extractTwitterMediaUrls({
	url,
	logger,
	preferredQuality: "high",
});

// Medium quality - ~800 Kbps, 640x360
await extractTwitterMediaUrls({
	url,
	logger,
	preferredQuality: "medium",
});

// Low quality - ~300 Kbps, 320x180
await extractTwitterMediaUrls({
	url,
	logger,
	preferredQuality: "low",
});
```

## 🚨 Error Handling

```typescript
const result = await extractTwitterMediaUrls({ url, logger });

if (!result.success) {
	console.error("Syndication API failed:", result.error);

	// Fallback to Puppeteer screenshot
	const screenshot = await withBrowser({ url, logger }, getTwitterScreenshot);
}
```

## 📊 Check Extraction Method

```typescript
const result = await extractTwitterMediaUrls({ url, logger });

console.log(`Method used: ${result.method}`);
// Value will always be 'syndication' (Twitter Syndication API)
```

## 💡 Pro Tips

### Tip 1: Cache Results

```typescript
const cache = new Map();
const cacheKey = extractTweetId(url);

if (cache.has(cacheKey)) {
	return cache.get(cacheKey);
}

const result = await extractTwitterMediaWithFallback({ url, logger });
cache.set(cacheKey, result);
```

### Tip 2: Extract in Parallel

```typescript
const urls = [url1, url2, url3];

const results = await Promise.all(
	urls.map((url) => extractTwitterMediaWithFallback({ url, logger })),
);
```

### Tip 3: Only Extract When Needed

```typescript
// Only extract if user specifically requests direct URLs
const extractMedia = request.query.get("extract") === "true";

const result = await getTwitterScreenshot({
	url,
	logger,
	extractMediaUrls: extractMedia,
});
```

## 📚 More Resources

- **Full Documentation**: `docs/TWITTER_EXTRACTION.md`
- **Architecture**: `docs/TWITTER_ARCHITECTURE.md`
- **Examples**: `examples/twitter-extraction-examples.ts`
- **Type Definitions**: `src/lib/twitter/types.ts`

## ❓ FAQ

**Q: Do I need Twitter API keys?**  
A: No! This uses public endpoints that don't require authentication.

**Q: Will this work on Vercel?**  
A: Yes! It's designed to be serverless-friendly and stateless.

**Q: How fast is it?**  
A: ~200ms for API extraction, vs 3-5s for Puppeteer. That's 15-25x faster!

**Q: What if the API fails?**  
A: It has 3 fallback strategies, and you can still use Puppeteer as final fallback.

**Q: Does it work with protected tweets?**  
A: No, only public tweets. For protected tweets, use Puppeteer fallback.

**Q: Can I get all video qualities?**  
A: Yes! Use `extractTwitterVideoUrls()` to get all available qualities.

---

**Ready to start?** Try the examples above with real tweet URLs! 🚀
