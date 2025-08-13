import type { MediaFeature, Viewport } from "rebrowser-puppeteer-core";

export const isDev = process.env.NODE_ENV === "development";

export const videoUrlRegex =
	/\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v|3gp|ogv|mpg|mpeg|m2v|divx|xvid|rm|rmvb|asf|ts|mts|vob|m3u8|mpd)(\?.*)?$/i;

export const imageUrlRegex =
	/\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|apng|tiff?)(\?.*)?$/i;

export const X = "x.com";
export const INSTAGRAM = "instagram.com";
export const CDN_INSTAGRAM = "cdninstagram.com";
export const YOUTUBE = "youtube.com";
export const TWITTER = "twitter.com";
export const YOUTUBE_THUMBNAIL_URL = "https://img.youtube.com/vi";

export const RESPONSE_HEADERS = {
	"X-Content-Type-Options": "nosniff",
	"X-Render-Engine": "puppeteer",
};

export const DEFAULT_VIEWPORT: Viewport = {
	deviceScaleFactor: 2,
	height: 750,
	width: 1200,
};

export const DEFAULT_MEDIA_FEATURES: MediaFeature[] = [
	{ name: "prefers-color-scheme", value: "dark" },
	{ name: "prefers-reduced-motion", value: "reduce" },
];
