import { NextResponse } from "next/server";

import { getErrorMessage } from "@/utils/errorUtils";

interface MetaData {
	description: null | string;
	favIcon: null | string;
	ogImage: null | string;
	title: null | string;
}

interface SuccessResponse {
	metaData: MetaData | null;
	screenshot: Buffer | Uint8Array;
}

const RESPONSE_HEADERS = {
	"X-Content-Type-Options": "nosniff",
	"X-Render-Engine": "puppeteer",
};

/**
 * Build success response with screenshot and metadata
 * @param {Buffer | Uint8Array} screenshot - The screenshot buffer or Uint8Array
 * @param {MetaData | null} metaData - Optional metadata about the page
 * @returns {NextResponse} NextResponse with success structure
 */
export function buildSuccessResponse(
	screenshot: Buffer | Uint8Array,
	metaData: MetaData | null,
): NextResponse {
	const responseBody: SuccessResponse = {
		metaData,
		screenshot,
	};

	const headers = new Headers(RESPONSE_HEADERS);
	return NextResponse.json(responseBody, { headers, status: 200 });
}

/**
 * Build error response with appropriate status and details
 * @param {unknown} [error] - The error object or message (optional)
 * @param {number} [status] - HTTP status code (default: 500)
 * @returns {NextResponse} NextResponse with error structure
 */
export function buildErrorResponse(
	error?: unknown,
	status = 500,
): NextResponse {
	const headers = new Headers(RESPONSE_HEADERS);

	// If no error provided, return generic internal server error
	if (!error) {
		return NextResponse.json(
			{ error: "Internal Server Error" },
			{ headers, status: 500 },
		);
	}

	const errorMessage = getErrorMessage(error);
	return NextResponse.json({ error: errorMessage }, { headers, status });
}
