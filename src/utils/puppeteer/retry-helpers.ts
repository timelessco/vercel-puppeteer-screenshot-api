import type { RequestConfig } from "./request-parser";

/**
 * Determines if an error is retryable based on common network and Puppeteer-specific error patterns
 * Checks for network errors, protocol errors, and browser connection issues
 * @param {unknown} error - The error to check for retryability
 * @returns {boolean} True if the error is retryable, false otherwise
 */
function shouldRetry(error: unknown): boolean {
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

interface RetryOptions {
	baseDelay?: number;
	logger: RequestConfig["logger"];
	maxRetries?: number;
	shouldRetry?: (error: Error) => boolean;
}

export interface RetryWithBackoffOptions<T> {
	callback: () => Promise<T>;
	options: RetryOptions;
}

/**
 * Executes a function with exponential backoff retry logic
 * Retries failed operations with increasing delays between attempts
 * @param {RetryWithBackoffOptions<T>} options - Options containing the callback and retry configuration
 * @returns {Promise<T>} The result of the callback function if successful
 */
export async function retryWithBackoff<T>(
	options: RetryWithBackoffOptions<T>,
): Promise<T> {
	const { callback, options: retryOptions } = options;
	const {
		baseDelay = 1000,
		logger,
		maxRetries = 2,
		shouldRetry: shouldRetryFn = shouldRetry,
	} = retryOptions;

	let lastError: Error | undefined;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			if (attempt > 0) {
				logger.info(`Retry attempt ${attempt}/${maxRetries - 1}`);
			}
			return await callback();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Check if error is retryable
			if (!shouldRetryFn(lastError)) {
				logger.debug("Error is not retryable", {
					error: lastError.message,
				});

				throw lastError;
			}

			logger.debug(`Attempt ${attempt + 1} failed`, {
				error: lastError.message,
				retryable: true,
			});

			// Don't delay after the last attempt
			if (attempt < maxRetries - 1) {
				const delay = baseDelay * Math.pow(2, attempt);
				logger.debug(`Waiting ${delay}ms before retry`);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	logger.warn("Max retries exceeded", {
		error: lastError?.message,
		maxRetries,
	});

	throw lastError ?? new Error("Max retries exceeded");
}
