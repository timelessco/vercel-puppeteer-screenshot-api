import type { Logger } from "./logger";

/**
 * Determines if an error is retryable based on common network and Puppeteer-specific error patterns.
 * @param {unknown} error - The error to check
 * @returns {boolean} true if the error is retryable, false otherwise
 */
export function shouldRetry(error: unknown): boolean {
	if (!(error instanceof Error)) return false;

	const retryableErrors = [
		// Network errors
		"net::ERR_CONNECTION_RESET",
		"net::ERR_CONNECTION_CLOSED",
		"net::ERR_CONNECTION_REFUSED",
		"net::ERR_NETWORK_CHANGED",
		"net::ERR_TIMED_OUT",
		"net::ERR_CONNECTION_TIMED_OUT",
		"net::ERR_INTERNET_DISCONNECTED",
		// Puppeteer-specific errors
		"Protocol error",
		"Target closed",
		"Session closed",
		"Page crashed",
		"Navigation failed",
		// Browser connection errors
		"connect to Chrome",
		"Browser closed",
		"browser has disconnected",
	];

	return retryableErrors.some((message) => error.message.includes(message));
}

/**
 * Executes a function with exponential backoff retry logic.
 * @param {() => Promise<T>} fn - The async function to execute
 * @param {object} [options] - Configuration options for retry behavior
 * @param {number} [options.baseDelay] - Base delay in milliseconds for exponential backoff
 * @param {Logger} [options.logger] - Logger instance for debugging
 * @param {number} [options.maxRetries] - Maximum number of retry attempts
 * @param {(error: Error) => boolean} [options.shouldRetry] - Custom function to determine if error is retryable
 * @returns {Promise<T>} The result of the function if successful
 * @throws The last error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	options?: {
		baseDelay?: number;
		logger?: Logger;
		maxRetries?: number;
		shouldRetry?: (error: Error) => boolean;
	},
): Promise<T> {
	const maxRetries = options?.maxRetries ?? 2;
	const baseDelay = options?.baseDelay ?? 1000;
	const logger = options?.logger;
	const shouldRetryFn = options?.shouldRetry ?? shouldRetry;

	let lastError: Error | undefined;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			if (attempt > 0) {
				logger?.info(`Retry attempt ${attempt}/${maxRetries - 1}`);
			}
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Check if error is retryable
			if (!shouldRetryFn(lastError)) {
				logger?.debug("Error is not retryable", {
					error: lastError.message,
				});

				throw lastError;
			}

			logger?.debug(`Attempt ${attempt + 1} failed`, {
				error: lastError.message,
				retryable: true,
			});

			// Don't delay after the last attempt
			if (attempt < maxRetries - 1) {
				const delay = baseDelay * Math.pow(2, attempt);
				logger?.debug(`Waiting ${delay}ms before retry`);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	logger?.warn("Max retries exceeded", {
		error: lastError?.message,
		maxRetries,
	});

	throw lastError ?? new Error("Max retries exceeded");
}
