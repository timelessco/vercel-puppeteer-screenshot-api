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
 * Twitter Syndication API Response
 */
export interface TwitterSyndicationResponse {
	__typename: "Tweet";
	/** Tweet ID as string */
	id_str: string;
	/** Tweet text content */
	text: string;
	/** User who posted the tweet */
	user: TwitterUser;
	/** Array of media attached to the tweet */
	mediaDetails?: TwitterMediaDetails[];
	/** Creation timestamp */
	created_at?: string;
	/** Conversation ID */
	conversation_id_str?: string;
	/** Language code */
	lang?: string;
}

/**
 * Processed video information with quality label
 */
export interface ProcessedVideo {
	/** Direct URL to video file */
	url: string;
	/** Quality label (high, medium, low) */
	quality: "high" | "low" | "medium";
	/** Bitrate in bps */
	bitrate: number;
	/** Content type */
	contentType: string;
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
	/** Array of video URLs with quality information */
	videos: ProcessedVideo[];
	/** Array of image URLs */
	images: ProcessedImage[];
	/** Array of GIF URLs (as MP4) */
	gifs: ProcessedGif[];
	/** Tweet metadata */
	tweet: {
		/** Tweet text */
		text: string;
		/** Author's name */
		author: string;
		/** Author's handle */
		handle: string;
		/** Tweet ID */
		id: string;
	};
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
	/** Preferred video quality (default: 'high') */
	preferredQuality?: "high" | "low" | "medium";
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

/**
 * Parsed Twitter URL components
 */
export interface ParsedTwitterUrl {
	/** Tweet ID */
	tweetId: string;
	/** Username (if available) */
	username?: string;
	/** Original URL */
	originalUrl: string;
	/** Whether URL is valid */
	isValid: boolean;
}
