/**
 * Browse Pool — manages multiple browser sessions for concurrent agent use.
 *
 * Sessions share the default browser context by default. Pass `isolated: true`
 * to create sessions with fully separate browser contexts (cookies, storage).
 *
 * Usage:
 *   const pool = createPool({ socketPath: "/tmp/browse-daemon.sock", maxSessions: 10 });
 *   const session = await pool.acquire();
 *   const result = await session.exec("goto", "https://example.com");
 *   pool.release(session);
 *
 *   // For isolated contexts:
 *   const pool = createPool({ socketPath: "...", isolated: true });
 */

import { connect } from "node:net";
import { readToken } from "./auth.ts";
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
	/** Create sessions with isolated browser contexts (default: false) */
	isolated?: boolean;
	/** Override socket creation for tests or custom transports. */
	connectFn?: typeof connect;
	/** Override auth token lookup for each request. */
	tokenProvider?: () => string | null;
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

type TransportConnection = {
	request: (
		cmd: string,
		args: string[],
		session?: string,
		timeoutMs?: number,
	) => Promise<Response>;
	destroy: () => void;
};

function createTransportConnection(
	socketPath: string,
	connectFn: typeof connect,
	tokenProvider: () => string | null,
): TransportConnection {
	let socket: ReturnType<typeof connect> | null = null;
	let connecting: Promise<ReturnType<typeof connect>> | null = null;
	let buffer = "";
	let pending: {
		resolve: (response: Response) => void;
		reject: (error: Error) => void;
		timer: ReturnType<typeof setTimeout>;
	} | null = null;
	let queue = Promise.resolve();

	function clearPending(error: Error) {
		if (!pending) return;
		clearTimeout(pending.timer);
		const current = pending;
		pending = null;
		current.reject(error);
	}

	function resetSocket() {
		if (socket && !socket.destroyed) {
			socket.destroy();
		}
		socket = null;
		buffer = "";
	}

	function attachSocket(nextSocket: ReturnType<typeof connect>) {
		nextSocket.on("data", (chunk) => {
			buffer += chunk.toString();
			if (!pending) return;

			const newlineIndex = buffer.indexOf("\n");
			if (newlineIndex === -1) return;

			const line = buffer.slice(0, newlineIndex).trim();
			buffer = buffer.slice(newlineIndex + 1);

			const current = pending;
			pending = null;
			clearTimeout(current.timer);

			try {
				current.resolve(JSON.parse(line));
			} catch {
				current.reject(new Error("Failed to parse daemon response"));
			}
		});

		nextSocket.on("error", (err) => {
			clearPending(err instanceof Error ? err : new Error(String(err)));
			resetSocket();
		});

		nextSocket.on("close", () => {
			clearPending(new Error("Daemon connection lost."));
			resetSocket();
		});
	}

	async function ensureSocket(): Promise<ReturnType<typeof connect>> {
		if (socket && !socket.destroyed) {
			return socket;
		}
		if (connecting) {
			return await connecting;
		}

		connecting = new Promise((resolve, reject) => {
			const nextSocket = connectFn(socketPath);
			const onConnect = () => {
				nextSocket.off("error", onConnectError);
				socket = nextSocket;
				attachSocket(nextSocket);
				resolve(nextSocket);
			};
			const onConnectError = (err: Error) => {
				nextSocket.off("connect", onConnect);
				reject(err);
			};
			nextSocket.once("connect", onConnect);
			nextSocket.once("error", onConnectError);
		}).finally(() => {
			connecting = null;
		});

		return await connecting;
	}

	return {
		request(cmd, args, session, timeoutMs = 30_000) {
			return new Promise((resolve, reject) => {
				queue = queue
					.then(async () => {
						const currentSocket = await ensureSocket();
						const payload: Record<string, unknown> = { cmd, args };
						if (session) payload.session = session;
						const token = tokenProvider();
						if (token) payload.token = token;

						await new Promise<void>((innerResolve, innerReject) => {
							const timer = setTimeout(() => {
								if (pending?.timer === timer) {
									pending = null;
								}
								resetSocket();
								innerReject(
									new Error(`Daemon request timed out after ${timeoutMs}ms`),
								);
							}, timeoutMs);

							pending = {
								resolve: (response) => {
									innerResolve();
									resolve(response);
								},
								reject: (error) => {
									innerReject(error);
									reject(error);
								},
								timer,
							};

							currentSocket.write(`${JSON.stringify(payload)}\n`, (err) => {
								if (err) {
									clearTimeout(timer);
									pending = null;
									innerReject(err);
									reject(err);
								}
							});
						});
					})
					.catch((error) => {
						reject(error instanceof Error ? error : new Error(String(error)));
					});
			});
		},
		destroy() {
			clearPending(new Error("Pool transport closed."));
			resetSocket();
		},
	};
}

export function createPool(options: PoolOptions): BrowsePool {
	const {
		socketPath,
		maxSessions = 10,
		idleTimeoutMs = 60_000,
		warmCount = 0,
		isolated = false,
		connectFn = connect,
		tokenProvider = readToken,
	} = options;
	const transport = createTransportConnection(
		socketPath,
		connectFn,
		tokenProvider,
	);

	let sessionCounter = 0;
	let pendingCreates = 0;
	const activeSessions = new Set<string>();
	const idleSessions: string[] = [];
	const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

	async function createSession(): Promise<string> {
		sessionCounter++;
		const id = `pool-${sessionCounter}-${Date.now()}`;
		const createArgs = ["create", id];
		if (isolated) {
			createArgs.push("--isolated");
		}
		const response = await transport.request("session", createArgs);
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
			await transport.request("session", ["close", id]);
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
				try {
					await closeSession(id);
				} catch (err) {
					console.error(`startIdleTimer: failed to close session ${id}:`, err);
				}
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
			const reusedId = idleSessions.pop();
			if (!reusedId) {
				throw new Error("Idle session queue unexpectedly empty.");
			}
			id = reusedId;
			clearIdleTimer(id);
		} else {
			const total = activeSessions.size + idleSessions.length + pendingCreates;
			if (total >= maxSessions) {
				throw new Error(
					`Pool exhausted: ${total}/${maxSessions} sessions in use. Release a session or increase maxSessions.`,
				);
			}
			pendingCreates++;
			try {
				id = await createSession();
			} finally {
				pendingCreates--;
			}
		}

		activeSessions.add(id);

		const handle: SessionHandle = {
			id,
			exec: (cmd: string, ...args: string[]) =>
				transport.request(cmd, args, id),
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
			const total = activeSessions.size + idleSessions.length + pendingCreates;
			if (total >= maxSessions) break;
			pendingCreates++;
			promises.push(
				createSession()
					.then((id) => {
						idleSessions.push(id);
						startIdleTimer(id);
					})
					.finally(() => {
						pendingCreates--;
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
		transport.destroy();
	}

	// Warm up if requested (non-blocking — acquire() may be called before warming completes)
	if (warmCount > 0) {
		warmUp(warmCount).catch((err) => {
			console.error("Pool warmUp failed:", err);
		});
	}

	return { acquire, release, warmUp, stats, destroy };
}
