import type { RequestConfig } from "../request/parseRequestConfig";

type LogLevel = "debug" | "error" | "info" | "warn";

type LogContext = Record<string, unknown>;

interface RuntimeMode {
	environment: string;
	headless: CreateLoggerOptions["headless"];
	verbose: CreateLoggerOptions["verbose"];
}

export interface CreateLoggerOptions {
	headless: RequestConfig["headless"];
	verbose: RequestConfig["verbose"];
}

/**
 * Creates a logger instance with runtime mode tracking and formatted output
 * Logs include timestamps, elapsed time, and runtime mode information
 * @param {CreateLoggerOptions} options - Configuration options for the logger
 * @returns {CreateLoggerReturnType} Logger instance with debug, error, info, warn, logSummary, and time methods
 */
export function createLogger(options: CreateLoggerOptions) {
	const { headless, verbose } = options;
	const startTime = Date.now();

	const runtimeMode: RuntimeMode = {
		environment: process.env.NODE_ENV as string,
		headless,
		verbose,
	};

	const formatTime = (): string => {
		const now = new Date();
		return now.toISOString();
	};

	const getElapsedTime = (): string => {
		const elapsed = Date.now() - startTime;
		return `${elapsed}ms`;
	};

	const log = (
		level: LogLevel,
		message: string,
		context?: LogContext,
	): void => {
		if (!verbose && level === "debug") return;

		const timestamp = formatTime();
		const elapsed = getElapsedTime();
		const modePrefix = `[${runtimeMode.headless ? "HEADLESS" : "HEADED"}]`;
		const logMessage = `${modePrefix}[${timestamp}] [${level.toUpperCase()}] ${message} (elapsed: ${elapsed})`;

		if (context && Object.keys(context).length > 0) {
			console.log(logMessage, context);
		} else {
			console.log(logMessage);
		}
	};

	const debug = (message: string, context?: LogContext): void => {
		log("debug", message, context);
	};

	const error = (message: string, context?: LogContext): void => {
		log("error", message, context);
	};

	const info = (message: string, context?: LogContext): void => {
		log("info", message, context);
	};

	const warn = (message: string, context?: LogContext): void => {
		log("warn", message, context);
	};

	const logRuntimeInfo = (): void => {
		const modeStr = [
			runtimeMode.headless ? "HEADLESS" : "HEADED",
			runtimeMode.verbose ? "VERBOSE" : "QUIET",
			runtimeMode.environment.toUpperCase(),
		].join(" | ");

		info(`Runtime Mode: ${modeStr}`);
	};

	// Log runtime info immediately upon creation
	logRuntimeInfo();

	const logSummary = (success: boolean, screenshotSize?: number): void => {
		const totalTime = Date.now() - startTime;
		info("Summary", {
			duration: `${totalTime}ms`,
			screenshotSize,
			success,
		});
	};

	const time = (label: string): (() => void) => {
		const start = Date.now();
		return () => {
			const duration = Date.now() - start;
			debug(`${label} completed`, { duration: `${duration}ms` });
		};
	};

	return {
		debug,
		error,
		info,
		logSummary,
		time,
		warn,
	};
}

export type CreateLoggerReturnType = ReturnType<typeof createLogger>;
