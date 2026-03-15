/**
 * Browse Pool — manages multiple isolated browser sessions for concurrent agent use.
 *
 * Usage:
 *   const pool = createPool({ socketPath: "/tmp/browse-daemon.sock", maxSessions: 10 });
 *   const session = await pool.acquire();
 *   const result = await session.exec("goto", "https://example.com");
 *   pool.release(session);
 */

import { connect } from "node:net";
import type { Response } from "./protocol.ts";

export type PoolOptions = {
	/** Path to the browse daemon socket */
	socketPath: string;
	/** Maximum number of concurrent sessions (default: 10) */
	maxSessions?: number;
	/** Idle timeout before releasing unused sessions (ms, default: 60000) */
	idleTimeoutMs?: number;
	/** Pre-warm this many sessions on pool creation (default: 0) */
	warmCount?: number;
};

export type SessionHandle = {
	/** Unique session identifier */
	id: string;
	/** Execute a browse command in this session */
	exec: (cmd: string, ...args: string[]) => Promise<Response>;
	/** Release this session back to the pool */
	release: () => void;
};

export type PoolStats = {
	active: number;
	idle: number;
	total: number;
	maxSessions: number;
};

export type BrowsePool = {
	/** Acquire an isolated session from the pool */
	acquire: () => Promise<SessionHandle>;
	/** Release a session back to the pool */
	release: (session: SessionHandle) => void;
	/** Pre-warm sessions for fast checkout */
	warmUp: (count: number) => Promise<void>;
	/** Get pool statistics */
	stats: () => PoolStats;
	/** Destroy the pool and close all sessions */
	destroy: () => Promise<void>;
};

let sessionCounter = 0;

function sendRequest(
	socketPath: string,
	cmd: string,
	args: string[],
	session?: string,
): Promise<Response> {
	return new Promise((resolve, reject) => {
		const payload: Record<string, unknown> = { cmd, args };
		if (session) payload.session = session;

		const client = connect(socketPath, () => {
			client.write(`${JSON.stringify(payload)}\n`);
		});

		let data = "";
		client.on("data", (chunk) => {
			data += chunk.toString();
		});
		client.on("end", () => {
			try {
				resolve(JSON.parse(data.trim()));
			} catch {
				reject(new Error("Failed to parse daemon response"));
			}
		});
		client.on("error", (err) => {
			reject(err);
		});
	});
}

export function createPool(options: PoolOptions): BrowsePool {
	const {
		socketPath,
		maxSessions = 10,
		idleTimeoutMs = 60_000,
		warmCount = 0,
	} = options;

	const activeSessions = new Set<string>();
	const idleSessions: string[] = [];
	const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

	async function createSession(): Promise<string> {
		sessionCounter++;
		const id = `pool-${sessionCounter}-${Date.now()}`;
		const response = await sendRequest(socketPath, "session", ["create", id]);
		if (!response.ok) {
			throw new Error(`Failed to create session: ${response.error}`);
		}
		return id;
	}

	async function closeSession(id: string): Promise<void> {
		const timer = idleTimers.get(id);
		if (timer) {
			clearTimeout(timer);
			idleTimers.delete(id);
		}
		try {
			await sendRequest(socketPath, "session", ["close", id]);
		} catch {
			// Best effort cleanup
		}
	}

	function startIdleTimer(id: string): void {
		const timer = setTimeout(async () => {
			const idx = idleSessions.indexOf(id);
			if (idx !== -1) {
				idleSessions.splice(idx, 1);
				idleTimers.delete(id);
				await closeSession(id);
			}
		}, idleTimeoutMs);
		idleTimers.set(id, timer);
	}

	function clearIdleTimer(id: string): void {
		const timer = idleTimers.get(id);
		if (timer) {
			clearTimeout(timer);
			idleTimers.delete(id);
		}
	}

	async function acquire(): Promise<SessionHandle> {
		let id: string;

		// Reuse an idle session if available
		if (idleSessions.length > 0) {
			id = idleSessions.pop()!;
			clearIdleTimer(id);
		} else {
			const total = activeSessions.size + idleSessions.length;
			if (total >= maxSessions) {
				throw new Error(
					`Pool exhausted: ${total}/${maxSessions} sessions in use. Release a session or increase maxSessions.`,
				);
			}
			id = await createSession();
		}

		activeSessions.add(id);

		const handle: SessionHandle = {
			id,
			exec: (cmd: string, ...args: string[]) =>
				sendRequest(socketPath, cmd, args, id),
			release: () => release(handle),
		};

		return handle;
	}

	function release(session: SessionHandle): void {
		if (!activeSessions.has(session.id)) return;
		activeSessions.delete(session.id);
		idleSessions.push(session.id);
		startIdleTimer(session.id);
	}

	async function warmUp(count: number): Promise<void> {
		const promises: Promise<void>[] = [];
		for (let i = 0; i < count; i++) {
			const total = activeSessions.size + idleSessions.length;
			if (total >= maxSessions) break;
			promises.push(
				createSession().then((id) => {
					idleSessions.push(id);
					startIdleTimer(id);
				}),
			);
		}
		await Promise.all(promises);
	}

	function stats(): PoolStats {
		return {
			active: activeSessions.size,
			idle: idleSessions.length,
			total: activeSessions.size + idleSessions.length,
			maxSessions,
		};
	}

	async function destroy(): Promise<void> {
		// Clear all idle timers
		for (const timer of idleTimers.values()) {
			clearTimeout(timer);
		}
		idleTimers.clear();

		// Close all sessions
		const allIds = [...activeSessions, ...idleSessions];
		const closePromises = allIds.map((id) => closeSession(id));
		await Promise.all(closePromises);

		activeSessions.clear();
		idleSessions.length = 0;
	}

	// Warm up if requested
	if (warmCount > 0) {
		warmUp(warmCount);
	}

	return { acquire, release, warmUp, stats, destroy };
}
