export type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

function normalizeLevel(input: string | undefined): LogLevel {
	if (!input) return "info";
	const lower = input.toLowerCase();
	if (
		lower === "debug" ||
		lower === "info" ||
		lower === "warn" ||
		lower === "error"
	) {
		return lower;
	}
	return "info";
}

function isJsonFormat(format: string | undefined): boolean {
	return (format ?? "").toLowerCase() === "json";
}

export function createLogger() {
	const minLevel = normalizeLevel(process.env.BROWSE_LOG_LEVEL);
	const jsonLogs = isJsonFormat(process.env.BROWSE_LOG_FORMAT);

	function log(level: LogLevel, message: string, context?: LogContext): void {
		if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) {
			return;
		}

		if (jsonLogs) {
			const payload = {
				ts: new Date().toISOString(),
				level,
				message,
				...(context ?? {}),
			};
			process.stderr.write(`${JSON.stringify(payload)}\n`);
			return;
		}

		const ctx = context ? ` ${JSON.stringify(context)}` : "";
		process.stderr.write(`[${level.toUpperCase()}] ${message}${ctx}\n`);
	}

	return {
		debug: (message: string, context?: LogContext) =>
			log("debug", message, context),
		info: (message: string, context?: LogContext) =>
			log("info", message, context),
		warn: (message: string, context?: LogContext) =>
			log("warn", message, context),
		error: (message: string, context?: LogContext) =>
			log("error", message, context),
	};
}
