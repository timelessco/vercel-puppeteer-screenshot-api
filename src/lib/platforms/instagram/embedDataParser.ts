import { z } from "zod";

import type { ExtractInstagramMediaOptions } from "@/lib/platforms/instagram/extractMediaUrls";
import type {
	InstagramMedia,
	InstagramNode,
} from "@/lib/platforms/instagram/types";

const InstagramNodeSchema: z.ZodType<InstagramNode> = z.lazy(() =>
	z.object({
		__typename: z.string(),
		display_url: z.url().optional(),
		edge_media_to_caption: z
			.object({
				edges: z.array(
					z.object({
						node: z.object({ text: z.string() }),
					}),
				),
			})
			.optional(),
		edge_sidecar_to_children: z
			.object({
				edges: z.array(
					z.object({
						node: z.lazy(() => InstagramNodeSchema),
					}),
				),
			})
			.optional(),
		video_url: z.url().optional(),
	}),
);

const InstagramEmbedDataSchema = z.object({
	gql_data: z
		.object({
			shortcode_media: z.lazy(() => InstagramNodeSchema).optional(),
			xdt_shortcode_media: z.lazy(() => InstagramNodeSchema).optional(),
		})
		.optional(),
});

const EmbedDataRawSchema = z.object({
	contextJSON: z.string(),
});

export function extractEmbedData(html: string) {
	const match = /"init",\s*\[\],\s*\[([\s\S]*?)\]\],/.exec(html);

	if (!match?.[1]) {
		throw new Error("Could not find embed data in HTML");
	}

	let raw: unknown;
	try {
		raw = JSON.parse(match[1]);
	} catch (error) {
		throw new Error(
			`Invalid embed data JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	const parsed = EmbedDataRawSchema.safeParse(raw);

	if (!parsed.success) {
		const issues = parsed.error.issues.map((issue) => issue.message).join("; ");
		throw new Error(`Invalid embed data raw structure: ${issues}`);
	}

	return parsed.data;
}

export function parseEmbedContext(contextJSON: string) {
	let raw: unknown;
	try {
		raw = JSON.parse(contextJSON);
	} catch (error) {
		throw new Error(
			`Invalid contextJSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	const parsed = InstagramEmbedDataSchema.safeParse(raw);

	if (!parsed.success) {
		const issues = parsed.error.issues.map((issue) => issue.message).join("; ");
		throw new Error(`Invalid embed data structure: ${issues}`);
	}

	const contextData = parsed.data;
	const shortcodeMedia =
		contextData.gql_data?.xdt_shortcode_media ??
		contextData.gql_data?.shortcode_media;

	const caption = shortcodeMedia?.edge_media_to_caption?.edges[0]?.node?.text;

	return { caption, shortcodeMedia };
}

type Logger = Pick<ExtractInstagramMediaOptions["logger"], "debug">;
export interface ExtractMediaItemsOptions {
	logger: Logger;
	shortcodeMedia: InstagramNode;
}

export function extractMediaItems(
	options: ExtractMediaItemsOptions,
): InstagramMedia[] {
	const { logger, shortcodeMedia } = options;

	const carouselEdges = shortcodeMedia.edge_sidecar_to_children?.edges;

	if (carouselEdges?.length) {
		logger.debug("Carousel detected", { items: carouselEdges.length });
		return carouselEdges.map((edge) => createMediaItem(edge.node));
	}

	logger.debug("Single media detected", { type: shortcodeMedia.__typename });
	return [createMediaItem(shortcodeMedia)];
}

function createMediaItem(node: InstagramNode): InstagramMedia {
	const isVideo = node.__typename === "GraphVideo";

	const thumbnail = node.display_url;
	if (!thumbnail) {
		throw new Error(`Missing display_url for ${node.__typename}`);
	}

	const url = isVideo ? node.video_url : node.display_url;
	if (!url) {
		throw new Error(
			`Missing ${isVideo ? "video_url" : "display_url"} for ${node.__typename}`,
		);
	}

	return {
		thumbnail,
		type: isVideo ? "video" : "image",
		url,
	};
}
