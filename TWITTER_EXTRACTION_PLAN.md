# Twitter Video URL Extraction Implementation Plan

## 📋 Overview

This document outlines the step-by-step plan to implement Twitter video URL extraction using Cobalt-inspired approach.

## 🎯 Goals

1. Extract direct video URLs from Twitter/X posts without Puppeteer
2. Support multiple video qualities (high, medium, low)
3. Handle images and GIFs from tweets
4. Implement fallback to Puppeteer when API methods fail
5. Make it Vercel-compatible (stateless, fast)

## 🏗️ Architecture

### Current Flow (Puppeteer-based)

```
Twitter URL → Launch Browser → Navigate → Find Elements → Screenshot
```

### New Flow (API-first with Fallback)

```
Twitter URL → Try API Extraction → Get Direct Media URLs → Fallback to Puppeteer if fails
```

## 📝 Implementation Steps

### Step 1: Create Twitter API Utilities

**File**: `src/lib/twitter/utils.ts`

**Functions to implement:**

- `extractTweetId(url: string)`: Extract tweet ID from various Twitter URL formats
- `isTweetUrl(url: string)`: Check if URL is a valid tweet URL
- `parseTwitterUrl(url: string)`: Parse Twitter URL into components

**Why**: Need to handle various Twitter URL formats:

- `https://twitter.com/user/status/123`
- `https://x.com/user/status/123`
- `https://mobile.twitter.com/user/status/123`
- `https://twitter.com/i/web/status/123`

---

### Step 2: Implement Twitter Media Extraction Service

**File**: `src/lib/twitter/extractMediaUrls.ts`

**Core Strategy (Multi-method approach):**

#### Method 1: Twitter Syndication API (Primary - No Auth Required)

```typescript
// Endpoint: https://cdn.syndication.twimg.com/tweet-result
// This is Twitter's public syndication API used for embedding tweets
// No authentication needed, works on Vercel
```

**Pros:**

- ✅ No authentication required
- ✅ Fast and reliable
- ✅ Returns video URLs, images, and metadata
- ✅ Works in serverless environment

**Cons:**

- ❌ May not work for protected accounts
- ❌ Could be rate-limited

#### Method 2: Twitter oEmbed API (Fallback)

```typescript
// Endpoint: https://publish.twitter.com/oembed
// Official public API for embedding
```

**Pros:**

- ✅ Official Twitter API
- ✅ No auth needed
- ✅ Returns metadata

**Cons:**

- ❌ Doesn't directly provide video URLs
- ❌ Need to parse HTML from response

#### Method 3: Direct HTML Parsing (Last Resort)

```typescript
// Fetch tweet page HTML and extract from meta tags
// Use og:video, twitter:player:stream tags
```

#### Method 4: Puppeteer Fallback (Existing Implementation)

```typescript
// Your current implementation - always works
```

---

### Step 3: Video Quality Selection

**File**: `src/lib/twitter/videoQuality.ts`

Twitter videos come in multiple bitrates:

- High quality: 2176000 bps (1280x720)
- Medium quality: 832000 bps (640x360)
- Low quality: 288000 bps (320x180)

**Function**: `selectBestVideoUrl(variants: VideoVariant[])`

---

### Step 4: Integration with Existing Code

**File**: `src/lib/puppeteer/screenshot/getTwitterScreenshot.ts`

**Modifications:**

1. Add option to extract URLs before screenshot
2. Return both screenshot AND media URLs
3. Add `extractMediaOnly` mode

**Updated interface:**

```typescript
interface TwitterResult {
	screenshot: Buffer;
	metaData: GetMetadataReturnType;
	mediaUrls?: {
		videos: Array<{ url: string; quality: string; type: string }>;
		images: Array<{ url: string; type: string }>;
		gifs: Array<{ url: string; type: string }>;
	};
}
```

---

### Step 5: API Route Enhancement

**File**: `src/app/try/route.ts`

**New query parameter:** `extractMedia=true`

When enabled:

- First try API extraction
- Return media URLs in response
- Still capture screenshot as fallback

---

## 🔑 Key Implementation Details

### Twitter Syndication API Structure

**Request:**

```typescript
const tweetId = "1234567890";
const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=a`;
```

**Response Structure:**

```typescript
interface SyndicationResponse {
	__typename: "Tweet";
	id_str: string;
	text: string;
	user: {
		name: string;
		screen_name: string;
		profile_image_url_https: string;
	};
	mediaDetails?: Array<{
		type: "video" | "photo" | "animated_gif";
		media_url_https: string;
		video_info?: {
			variants: Array<{
				bitrate?: number;
				content_type: string; // "video/mp4"
				url: string;
			}>;
		};
	}>;
}
```

---

## 📦 Dependencies Needed

**No new dependencies required!** ✅

Use existing:

- `cross-fetch` - Already in package.json
- `ky` - Already in package.json (better than fetch)
- Built-in URL parsing

---

## 🚀 Usage Examples

### Example 1: Extract Video URLs Only

```typescript
import { extractTwitterMediaUrls } from "@/lib/twitter/extractMediaUrls";

const result = await extractTwitterMediaUrls({
	url: "https://twitter.com/user/status/123",
	logger,
});

// Result:
// {
//   videos: [{
//     url: 'https://video.twimg.com/...',
//     quality: 'high',
//     bitrate: 2176000
//   }],
//   images: [...],
//   tweet: { text, author, ... }
// }
```

### Example 2: Hybrid Approach (URLs + Screenshot)

```typescript
const result = await getTwitterScreenshot({
	url: "https://twitter.com/user/status/123",
	extractMediaUrls: true,
	browser,
	logger,
});

// Result includes both screenshot and direct media URLs
```

---

## ✅ Testing Strategy

### Test Cases:

1. ✅ Tweet with single video
2. ✅ Tweet with multiple images
3. ✅ Tweet with GIF
4. ✅ Tweet with no media (text only)
5. ✅ Protected/private tweets (should fallback)
6. ✅ Deleted tweets (should handle gracefully)
7. ✅ Rate limiting scenarios

---

## 🎨 Benefits of This Approach

1. **Speed**: API calls are 10-50x faster than Puppeteer
2. **Cost**: Reduced Puppeteer usage = lower Vercel costs
3. **Quality**: Direct video URLs = original quality
4. **Reliability**: Multiple fallback strategies
5. **Flexibility**: Can extract URLs without screenshots
6. **Vercel-Friendly**: Stateless, fast, no browser overhead

---

## 📊 Expected Performance

| Method          | Speed  | Success Rate | Cost     |
| --------------- | ------ | ------------ | -------- |
| Syndication API | ~200ms | 85%          | Very Low |
| oEmbed API      | ~300ms | 75%          | Very Low |
| HTML Parsing    | ~500ms | 60%          | Low      |
| Puppeteer       | ~3-5s  | 95%          | High     |

---

## 🔄 Migration Path

### Phase 1: Add API extraction (Non-breaking)

- Keep existing Puppeteer code
- Add new extraction functions
- Add optional `extractMediaUrls` parameter

### Phase 2: Make API extraction default

- Try API first
- Fallback to Puppeteer if needed

### Phase 3: Optimize

- Cache successful API patterns
- Fine-tune timeout values
- Add telemetry

---

## 🚨 Limitations & Considerations

### What Works:

- ✅ Public tweets
- ✅ Videos, images, GIFs
- ✅ Multiple media items
- ✅ Tweet metadata

### What Doesn't Work:

- ❌ Protected/private accounts (will use Puppeteer fallback)
- ❌ Login-required content
- ❌ Spaces, Fleets (deprecated anyway)

### Rate Limiting:

- Twitter Syndication API has generous rate limits
- No authentication = no API key to revoke
- Vercel's distributed nature helps spread requests

---

## 📚 References

### Cobalt's Approach:

- Multi-strategy fallback
- No authentication when possible
- Direct media URL extraction
- Quality selection

### Twitter's Public APIs:

- Syndication API: `cdn.syndication.twimg.com`
- oEmbed API: `publish.twitter.com/oembed`
- Video CDN: `video.twimg.com`

---

## 🎯 Next Steps

1. ✅ Create this plan document
2. ⏳ Implement utility functions
3. ⏳ Build extraction service
4. ⏳ Add integration hooks
5. ⏳ Test with real tweets
6. ⏳ Deploy and monitor

---

**Ready to implement!** 🚀
