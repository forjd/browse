import type { Response } from "./protocol.ts";

const RETRIABLE_MESSAGES = [
	"DAEMON_NOT_RUNNING",
	"Daemon connection lost.",
	"Failed to parse daemon response",
];

export type RetryDeps = {
	sendRequest: (cmd: string, args: string[]) => Promise<Response>;
	spawnDaemon: () => Promise<void>;
	cleanupStaleFiles: () => void;
	/** Override for the backoff sleep — defaults to setTimeout-based delay. */
	sleep?: (ms: number) => Promise<void>;
};

/**
 * Check whether an error indicates a connection-level failure
 * that warrants a daemon restart and retry.
 */
export function isRetriableError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	return RETRIABLE_MESSAGES.includes(err.message);
}

/**
 * Maximum number of retry attempts before giving up.
 */
const MAX_RETRIES = 3;

/**
 * Backoff delays in milliseconds for each retry attempt (1s, 2s, 4s).
 */
const BACKOFF_DELAYS = [1_000, 2_000];

/**
 * Circuit breaker: number of consecutive failures before skipping.
 */
const CIRCUIT_BREAKER_THRESHOLD = 3;

let consecutiveFailures = 0;

/**
 * Reset the circuit breaker (e.g. after a successful request).
 */
export function resetCircuitBreaker(): void {
	consecutiveFailures = 0;
}

/**
 * Send a command with automatic crash recovery using exponential backoff.
 *
 * On connection-level failure: clean up stale files, restart daemon, retry
 * up to MAX_RETRIES times with exponential backoff (1s, 2s, 4s).
 * Application-level errors (ok: false) are returned as-is — no retry.
 *
 * Circuit breaker: after CIRCUIT_BREAKER_THRESHOLD consecutive failures,
 * immediately fail without retrying.
 */
export async function sendWithRetry(
	deps: RetryDeps,
	cmd: string,
	args: string[],
): Promise<Response> {
	// Circuit breaker check
	if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
		throw new Error(
			`Circuit breaker open: ${consecutiveFailures} consecutive daemon failures. Restart with 'browse quit' and try again.`,
		);
	}

	const sleep =
		deps.sleep ??
		((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

	try {
		const response = await deps.sendRequest(cmd, args);
		resetCircuitBreaker();
		return response;
	} catch (err) {
		if (!isRetriableError(err)) throw err;

		// Connection-level failure — attempt recovery with backoff
		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			deps.cleanupStaleFiles();

			try {
				await deps.spawnDaemon();
			} catch (spawnErr) {
				consecutiveFailures++;
				if (attempt === MAX_RETRIES - 1) {
					const detail =
						spawnErr instanceof Error ? spawnErr.message : String(spawnErr);
					throw new Error(
						`Daemon crashed and recovery failed after ${MAX_RETRIES} attempts. Error: ${detail}`,
					);
				}
				await sleep(BACKOFF_DELAYS[attempt] ?? 1_000);
				continue;
			}

			try {
				const response = await deps.sendRequest(cmd, args);
				resetCircuitBreaker();
				return response;
			} catch (retryErr) {
				consecutiveFailures++;
				if (!isRetriableError(retryErr)) {
					const detail =
						retryErr instanceof Error ? retryErr.message : String(retryErr);
					throw new Error(
						`Daemon restarted but command failed. Error: ${detail}`,
					);
				}
				if (attempt === MAX_RETRIES - 1) {
					const detail =
						retryErr instanceof Error ? retryErr.message : String(retryErr);
					throw new Error(
						`Daemon crashed and recovery failed after ${MAX_RETRIES} attempts. Error: ${detail}`,
					);
				}
				await sleep(BACKOFF_DELAYS[attempt] ?? 1_000);
			}
		}

		// Should not reach here, but just in case
		throw new Error("Daemon recovery failed unexpectedly.");
	}
}
