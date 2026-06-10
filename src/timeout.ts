export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Wrap an async operation with a timeout. Rejects with a descriptive error
 * if the operation exceeds `ms` milliseconds.
 */
export async function withTimeout<T>(
	fn: () => Promise<T>,
	ms: number,
): Promise<T> {
	const effectiveMs = ms > 0 ? ms : DEFAULT_TIMEOUT_MS;

	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`Command timed out after ${effectiveMs}ms`)),
			effectiveMs,
		);
	});

	try {
		return await Promise.race([fn(), timeout]);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Resolve the timeout to use, following three-tier precedence:
 * 1. CLI --timeout flag (highest)
 * 2. Config file timeout
 * 3. Hardcoded default (30s)
 */
export function resolveTimeout(
	cliTimeout: number | undefined,
	configTimeout: number | undefined,
): number {
	if (cliTimeout && cliTimeout > 0) return cliTimeout;
	if (configTimeout && configTimeout > 0) return configTimeout;
	return DEFAULT_TIMEOUT_MS;
}
