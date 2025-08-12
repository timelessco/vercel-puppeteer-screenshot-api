import type { RequestConfig } from "../request/parseRequestConfig";

interface RetryOptions {
	baseDelay?: number;
	logger: RequestConfig["logger"];
	maxRetries?: number;
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
	const { baseDelay = 1000, logger, maxRetries = 2 } = retryOptions;

	let lastError: Error | undefined;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			if (attempt > 0) {
				logger.info(`Retry attempt ${attempt}/${maxRetries - 1}`);
			}
			return await callback();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

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
