/**
 * Twitter/X Media Extraction Types
 * Based on Twitter's Syndication API and oEmbed API responses
 */

/**
 * Video variant with quality information
 */
export interface TwitterVideoVariant {
	/** Video bitrate in bps (e.g., 2176000 for high quality) */
	bitrate?: number;
	/** Content type (e.g., "video/mp4", "application/x-mpegURL") */
	content_type: string;
	/** Direct URL to the video file */
	url: string;
}

/**
 * Twitter media details from syndication API
 */
export interface TwitterMediaDetails {
	/** Media type */
	type: "animated_gif" | "photo" | "video";
	/** HTTPS URL to the media (for images) */
	media_url_https: string;
	/** Video information (only present for videos and GIFs) */
	video_info?: {
		/** Array of video variants with different qualities */
		variants: TwitterVideoVariant[];
	};
	/** Extended media details */
	ext_alt_text?: string;
}

/**
 * Twitter user information
 */
export interface TwitterUser {
	/** User's display name */
	name: string;
	/** User's @handle */
	screen_name: string;
	/** Profile image URL */
	profile_image_url_https: string;
}

/**
 * Processed image information
 */
export interface ProcessedImage {
	/** Direct URL to image file */
	url: string;
	/** Alt text if available */
	altText?: string;
}

/**
 * Processed GIF information
 */
export interface ProcessedGif {
	/** Direct URL to GIF/video file (Twitter converts GIFs to MP4) */
	url: string;
	/** Thumbnail URL */
	thumbnail: string;
}

/**
 * Extracted media URLs from a tweet
 */
export interface ExtractedTwitterMedia {
	/** Array of GIF URLs (as MP4) */
	gifs: ProcessedGif[];
	/** Array of image URLs */
	images: ProcessedImage[];
	/** Array of video URLs (highest quality) */
	videos: string[];
}

/**
 * Options for Twitter media extraction
 */
export interface ExtractTwitterMediaOptions {
	/** Twitter/X URL to extract media from */
	url: string;
	/** Logger instance */
	logger: {
		debug: (message: string, context?: Record<string, unknown>) => void;
		error: (message: string, context?: Record<string, unknown>) => void;
		info: (message: string, context?: Record<string, unknown>) => void;
		warn: (message: string, context?: Record<string, unknown>) => void;
	};
}

/**
 * Result of media extraction attempt
 */
export interface ExtractionResult {
	/** Whether extraction was successful */
	success: boolean;
	/** Extracted media (if successful) */
	media?: ExtractedTwitterMedia;
	/** Error message (if failed) */
	error?: string;
	/** Method used for extraction */
	method: "syndication";
}
