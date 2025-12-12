import { z } from "zod";

import type { ExtractInstagramMediaOptions } from "./extractMediaUrls";
import type { InstagramMedia, InstagramNode } from "./types";

const InstagramNodeSchema: z.ZodType<InstagramNode> = z.lazy(() =>
	z.object({
		__typename: z.string(),
		display_url: z.url().optional(),
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

export function extractEmbedData(html: string) {
	const match = /"init",\s*\[\],\s*\[(.*?)\]\],/.exec(html);

	if (!match?.[1]) {
		throw new Error("Could not find embed data in HTML");
	}

	const embedDataRaw = JSON.parse(match[1]) as { contextJSON: string };

	if (!embedDataRaw.contextJSON) {
		throw new Error("Missing contextJSON in embed data");
	}

	return embedDataRaw;
}

export function parseEmbedContext(contextJSON: string) {
	const parsed = InstagramEmbedDataSchema.safeParse(JSON.parse(contextJSON));
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

export function extractMediaItems(
	shortcodeMedia: InstagramNode,
	logger: Logger,
): InstagramMedia[] {
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

	return {
		thumbnail: node.display_url ?? "",
		type: isVideo ? "video" : "image",
		url: isVideo ? (node.video_url ?? "") : (node.display_url ?? ""),
	};
}
