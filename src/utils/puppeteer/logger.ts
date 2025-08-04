type LogLevel = "debug" | "error" | "info" | "warn";

type LogContext = Record<string, unknown>;

interface RuntimeMode {
	environment: string;
	headless: boolean;
	verbose: boolean;
}

export const createLogger = (verbose = false, headless = true) => {
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

	const logNetworkRequest = (
		url: string,
		method: string,
		status?: number,
		blocked = false,
	): void => {
		if (!verbose) return;

		if (blocked) {
			debug(`Network request blocked: ${method} ${url}`);
		} else {
			debug(`Network request: ${method} ${url}`, {
				status: status ?? "pending",
			});
		}
	};

	const logSummary = (success: boolean, screenshotSize?: number): void => {
		const totalTime = Date.now() - startTime;
		info("Screenshot capture completed", {
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
		logNetworkRequest,
		logSummary,
		time,
		warn,
	};
};

export type Logger = ReturnType<typeof createLogger>;
