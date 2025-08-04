import { type NextRequest } from "next/server";

import { createLogger, type Logger } from "./logger";
import { isDev } from "./utils";

export interface RequestConfig {
	fullPage: boolean;
	headless: boolean;
	imageIndex: null | string;
	logger: Logger;
	url: string;
}

export function parseRequestConfig(
	request: NextRequest,
): RequestConfig | { error: string } {
	const searchParams = request.nextUrl.searchParams;
	const urlParam = searchParams.get("url");

	if (!urlParam) {
		return { error: "Please provide a url parameter." };
	}

	// Prepend http:// if missing to ensure valid URL construction for navigation
	let inputUrl = urlParam.trim();
	if (!/^https?:\/\//i.test(inputUrl)) {
		inputUrl = `http://${inputUrl}`;
	}

	// Validate URL format and ensure it's HTTP/HTTPS to prevent security issues and navigation errors
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(inputUrl);
		if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
			return { error: "URL must start with http:// or https://" };
		}
	} catch {
		return { error: "Invalid URL provided." };
	}

	// Determine full page mode based on query parameter
	const fullPageParam = searchParams.get("fullpage");
	const fullPage = fullPageParam === "true";

	// Determine headless mode based on environment and query parameter
	const forceHeadless = searchParams.get("headless") === "true";
	const headless = isDev ? forceHeadless : true;

	// Extract image index from the target URL params
	const imageIndex = parsedUrl.searchParams.get("img_index") ?? null;

	// Setup logger
	const verbose = searchParams.get("verbose") === "true";
	const logger = createLogger(verbose, headless);

	return {
		fullPage,
		headless,
		imageIndex,
		logger,
		url: inputUrl,
	};
}
