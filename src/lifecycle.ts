import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

export type LifecycleConfig = {
	pidPath: string;
	socketPath: string;
	idleTimeoutMs: number;
};

export const DEFAULT_CONFIG: LifecycleConfig = {
	pidPath: "/tmp/browse-daemon.pid",
	socketPath: "/tmp/browse-daemon.sock",
	idleTimeoutMs: 30 * 60 * 1000,
};

/** Returns true if a live daemon is already running. Cleans up stale PID files. */
export function checkStalePid(config: LifecycleConfig): boolean {
	if (!existsSync(config.pidPath)) return false;

	const content = readFileSync(config.pidPath, "utf-8").trim();
	const pid = Number.parseInt(content, 10);
	if (Number.isNaN(pid)) {
		rmSync(config.pidPath, { force: true });
		return false;
	}

	try {
		process.kill(pid, 0);
		return true;
	} catch {
		rmSync(config.pidPath, { force: true });
		return false;
	}
}

export function writePidFile(config: LifecycleConfig): void {
	writeFileSync(config.pidPath, String(process.pid), { mode: 0o600 });
}

export function cleanupFiles(config: LifecycleConfig): void {
	rmSync(config.pidPath, { force: true });
	rmSync(config.socketPath, { force: true });
}

export type IdleTimer = {
	reset: () => void;
	clear: () => void;
};

export function createIdleTimer(
	config: LifecycleConfig,
	onExpiry: () => void,
): IdleTimer {
	let handle: ReturnType<typeof setTimeout> | null = null;

	function start() {
		handle = setTimeout(onExpiry, config.idleTimeoutMs);
	}

	function reset() {
		if (handle !== null) clearTimeout(handle);
		start();
	}

	function clear() {
		if (handle !== null) {
			clearTimeout(handle);
			handle = null;
		}
	}

	start();
	return { reset, clear };
}
