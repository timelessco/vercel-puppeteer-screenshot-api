/**
 * Instagram Media Extraction Types
 * Based on Instagram's Embed API and GraphQL responses
 */

/**
 * Extracted Instagram media item (image or video)
 */
export interface InstagramMedia {
	/** Media height in pixels */
	height?: number;
	/** Thumbnail URL (poster image for videos) */
	thumbnail?: string;
	/** Media type */
	type: "image" | "video";
	/** Direct URL to the media file */
	url: string;
	/** Media width in pixels */
	width?: number;
	/** Caption */
	caption?: null | string;
}

/**
 * Instagram GraphQL node structure
 * Represents a single media item in Instagram's data structure
 */
export interface InstagramNode {
	/** GraphQL type name (e.g., "GraphImage", "GraphVideo") */
	__typename: string;
	/** Media dimensions */
	dimensions?: {
		/** Height in pixels */
		height: number;
		/** Width in pixels */
		width: number;
	};
	/** Display URL for images or video thumbnail */
	display_url?: string;
	/** Carousel children (for multi-image/video posts) */
	edge_sidecar_to_children?: {
		/** Array of carousel items */
		edges: Array<{
			/** Child media node */
			node: InstagramNode;
		}>;
	};
	/** Caption data */
	edge_media_to_caption?: {
		edges: Array<{
			node: {
				text: string;
			};
		}>;
	};
	/** Direct video URL (only present for video posts) */
	video_url?: string;
}

/**
 * Instagram embed data structure
 * Parsed from the contextJSON in embed page
 */
export interface InstagramEmbedData {
	/** GraphQL data container */
	gql_data?: {
		/** Legacy field for shortcode media */
		shortcode_media?: InstagramNode;
		/** Current field for shortcode media (XDT format) */
		xdt_shortcode_media?: InstagramNode;
	};
}
