import { type NextRequest } from "next/server";

import { getErrorMessage } from "@/utils/errorUtils";

import { isDev } from "./constants";
import { createLogger, type CreateLoggerReturnType } from "./logger";

export interface RequestConfig {
	fullPage: boolean;
	headless: boolean;
	imageIndex: null | string;
	logger: CreateLoggerReturnType;
	shouldGetPageMetrics: boolean;
	url: string;
	verbose: boolean;
}

/**
 * Parses request parameters and creates a configuration object for screenshot capture
 * Validates URL format and extracts query parameters for screenshot options
 * @param {NextRequest} request - The incoming Next.js request object
 * @returns {RequestConfig | { error: string }} Configuration object or error message
 */
export function parseRequestConfig(
	request: NextRequest,
): RequestConfig | { error: string } {
	try {
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
		const logger = createLogger({ headless, verbose });

		// Monitor page metrics when verbose mode is enabled or in development
		const shouldGetPageMetrics =
			process.env.NODE_ENV === "development" || verbose;

		return {
			fullPage,
			headless,
			imageIndex,
			logger,
			shouldGetPageMetrics,
			url: parsedUrl.href,
			verbose,
		};
	} catch (error) {
		// Handle any unexpected errors during request parsing
		return { error: getErrorMessage(error) };
	}
}
