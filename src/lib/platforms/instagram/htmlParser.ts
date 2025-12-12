import { parse } from "node-html-parser";

import type { ExtractInstagramMediaOptions } from "./extractMediaUrls";
import type { InstagramMedia } from "./types";

type Logger = Pick<ExtractInstagramMediaOptions["logger"], "debug">;

export function extractMediaFromHtml(
	html: string,
	logger: Logger,
): { caption?: string; mediaList: InstagramMedia[] } {
	const media: InstagramMedia[] = [];
	let caption: string | undefined;

	const root = parse(html);

	const captionDiv = root.querySelector(".Caption");
	if (captionDiv) {
		captionDiv
			.querySelectorAll(".CaptionUsername, .CaptionComments")
			.forEach((node) => {
				node.remove();
			});
		const rawCaption = decodeHtmlEntities(captionDiv.text.trim());
		if (rawCaption) {
			caption = rawCaption;
			logger.debug("Extracted caption from HTML", { caption });
		}
	}

	const embeddedImg = root.querySelector("img.EmbeddedMediaImage");
	let thumbnailUrl = embeddedImg?.getAttribute("src") ?? undefined;

	const srcsetAttr = embeddedImg?.getAttribute("srcset");
	if (srcsetAttr) {
		const sources = srcsetAttr.split(",").map((s) => {
			const [url, widthStr] = s.trim().split(" ");
			const width = widthStr ? Number.parseInt(widthStr) : 0;
			return { url, width };
		});
		sources.sort((a, b) => b.width - a.width);
		if (sources[0]?.url) {
			thumbnailUrl = sources[0].url;
		}
	}

	const decodedThumbnail = thumbnailUrl
		? decodeHtmlEntities(thumbnailUrl)
		: undefined;

	let videoUrl: string | undefined;

	const isVideoPost =
		html.includes('data-media-type="GraphVideo"') ||
		html.includes("Sprite PlayButtonSprite");

	if (isVideoPost) {
		const videoUrlPatterns = [
			/"video_url"\s*:\s*"([^"]+\.mp4[^"]*)"/,
			/https:\/\/[^"'\s]*\.cdninstagram\.com[^"'\s]*\.mp4[^"'\s]*/,
			/https:\/\/scontent[^"'\s]*\.mp4[^"'\s]*/,
		];

		for (const pattern of videoUrlPatterns) {
			const match = pattern.exec(html);
			if (match) {
				const potentialUrl = match[1] || match[0];
				videoUrl = decodeHtmlEntities(
					potentialUrl
						.replaceAll(String.raw`\/`, "/")
						.replaceAll(String.raw`\u0026`, "&"),
				);
				break;
			}
		}

		if (!videoUrl) {
			const videoTagMatch = /<video[^>]*src="([^"]+)"/.exec(html);
			if (videoTagMatch?.[1]) {
				videoUrl = decodeHtmlEntities(videoTagMatch[1]);
			}
		}

		if (!videoUrl) {
			const sourceTagMatch = /<source[^>]*src="([^"]+\.mp4[^"]*)"/.exec(html);
			if (sourceTagMatch?.[1]) {
				videoUrl = decodeHtmlEntities(sourceTagMatch[1]);
			}
		}
	}

	if (videoUrl && decodedThumbnail) {
		logger.debug("Found video URL in HTML", { videoUrl });
		media.push({
			thumbnail: decodedThumbnail,
			type: "video",
			url: videoUrl,
		});
	} else if (decodedThumbnail) {
		if (isVideoPost) {
			logger.debug(
				"Video post detected but video URL not found in HTML, using thumbnail only",
			);
		}
		media.push({
			thumbnail: decodedThumbnail,
			type: "image",
			url: decodedThumbnail,
		});
	}

	return { caption, mediaList: media };
}

function decodeHtmlEntities(input: string) {
	return input
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#064;", "@");
}
