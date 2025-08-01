import { type NextRequest } from "next/server";

import { isDev } from "./utils";

export interface RequestConfig {
	fullPage: boolean;
	headless: boolean;
	imageIndex: null | string;
	url: string;
}

export function parseRequestConfig(
	request: NextRequest,
): RequestConfig | { error: string } {
	const searchParams = request.nextUrl.searchParams;
	const url = searchParams.get("url");

	if (!url) {
		return { error: "Missing url parameter" };
	}

	// Determine full page mode based on query parameter
	const fullPageParam = searchParams.get("fullpage");
	const fullPage = fullPageParam === "true";

	// Determine headless mode based on environment and query parameter
	const forceHeadless = searchParams.get("headless") === "true";
	const headless = isDev ? forceHeadless : true;

	// Extract image index from the target URL params
	const imageIndex = new URL(url).searchParams.get("img_index") ?? null;

	return {
		fullPage,
		headless,
		imageIndex,
		url,
	};
}
