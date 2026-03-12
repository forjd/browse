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
 * Send a command with automatic crash recovery.
 *
 * On connection-level failure: clean up stale files, restart daemon, retry once.
 * Application-level errors (ok: false) are returned as-is — no retry.
 */
export async function sendWithRetry(
	deps: RetryDeps,
	cmd: string,
	args: string[],
): Promise<Response> {
	try {
		return await deps.sendRequest(cmd, args);
	} catch (err) {
		if (!isRetriableError(err)) throw err;

		// Connection-level failure — attempt recovery
		deps.cleanupStaleFiles();

		try {
			await deps.spawnDaemon();
		} catch (spawnErr) {
			const detail =
				spawnErr instanceof Error ? spawnErr.message : String(spawnErr);
			throw new Error(`Daemon crashed and recovery failed. Error: ${detail}`);
		}

		// Retry once
		try {
			return await deps.sendRequest(cmd, args);
		} catch (retryErr) {
			const detail =
				retryErr instanceof Error ? retryErr.message : String(retryErr);
			throw new Error(`Daemon crashed and recovery failed. Error: ${detail}`);
		}
	}
}
