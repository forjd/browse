import {
	chmodSync,
	closeSync,
	constants,
	existsSync,
	fchmodSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	rmSync,
	statSync,
	writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type LifecycleConfig = {
	pidPath: string;
	socketPath: string;
	idleTimeoutMs: number;
};

function runtimeBaseDir(): string {
	if (process.env.XDG_RUNTIME_DIR) {
		return join(process.env.XDG_RUNTIME_DIR, "browse");
	}
	return join(
		process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
		"browse",
		"run",
	);
}

function ensurePrivateRuntimeDir(dir: string): string {
	if (existsSync(dir)) {
		const lst = lstatSync(dir);
		if (lst.isSymbolicLink() || !lst.isDirectory()) {
			throw new Error(`Unsafe browse runtime directory: ${dir}`);
		}
		const st = statSync(dir);
		if (typeof process.getuid === "function" && st.uid !== process.getuid()) {
			throw new Error(
				`Browse runtime directory is not owned by this user: ${dir}`,
			);
		}
	} else {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	chmodSync(dir, 0o700);
	return dir;
}

const DEFAULT_RUNTIME_DIR = ensurePrivateRuntimeDir(runtimeBaseDir());

export function getDefaultRuntimeDir(): string {
	return DEFAULT_RUNTIME_DIR;
}

export const DEFAULT_CONFIG: LifecycleConfig = {
	pidPath: join(DEFAULT_RUNTIME_DIR, "browse-daemon.pid"),
	socketPath: join(DEFAULT_RUNTIME_DIR, "browse-daemon.sock"),
	idleTimeoutMs: 30 * 60 * 1000,
};

/** Returns true if a live daemon is already running. Cleans up stale PID files. */
export function checkStalePid(config: LifecycleConfig): boolean {
	if (!existsSync(config.pidPath)) return false;

	const stats = lstatSync(config.pidPath);
	if (stats.isSymbolicLink()) {
		rmSync(config.pidPath, { force: true });
		return false;
	}
	if (!stats.isFile()) {
		throw new Error(`Unsafe browse PID file path: ${config.pidPath}`);
	}

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
	const fd = openSync(
		config.pidPath,
		constants.O_WRONLY |
			constants.O_CREAT |
			constants.O_EXCL |
			constants.O_NOFOLLOW,
		0o600,
	);
	try {
		fchmodSync(fd, 0o600);
		writeSync(fd, String(process.pid));
	} finally {
		closeSync(fd);
	}
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
