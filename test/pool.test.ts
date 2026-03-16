import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ServerDeps } from "../src/daemon.ts";
import { startServer } from "../src/daemon.ts";
import type { LifecycleConfig } from "../src/lifecycle.ts";
import { createPool } from "../src/pool.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-pool");
let testIndex = 0;

function testPaths(): LifecycleConfig & { dir: string } {
	testIndex++;
	const dir = join(TEST_DIR, `run-${testIndex}`);
	mkdirSync(dir, { recursive: true });
	return {
		dir,
		socketPath: join(dir, "test.sock"),
		pidPath: join(dir, "test.pid"),
		idleTimeoutMs: 60_000,
	};
}

const mainFrameSentinel = {};

function mockPage(overrides: Record<string, unknown> = {}) {
	return {
		goto: mock(() => Promise.resolve()),
		title: mock(() => Promise.resolve("Mock Title")),
		innerText: mock(() => Promise.resolve("Mock body text")),
		on: mock(() => {}),
		mainFrame: mock(() => mainFrameSentinel),
		url: mock(() => "https://example.com"),
		...overrides,
	} as never;
}

function mockContext(overrides: Record<string, unknown> = {}) {
	return {
		storageState: mock(() => Promise.resolve({ cookies: [], origins: [] })),
		addCookies: mock(() => Promise.resolve()),
		newPage: mock(() => Promise.resolve(mockPage())),
		cookies: mock(() => Promise.resolve([])),
		...overrides,
	} as never;
}

function mockDeps(
	page: ReturnType<typeof mockPage>,
	overrides: Partial<ServerDeps> = {},
): ServerDeps {
	return {
		page,
		context: mockContext(),
		config: null,
		...overrides,
	};
}

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("BrowsePool", () => {
	test("acquire and release a session", async () => {
		const config = testPaths();
		const ctx = mockContext({
			newPage: mock(() => Promise.resolve(mockPage())),
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			const pool = createPool({
				socketPath: config.socketPath,
				maxSessions: 5,
			});

			const session = await pool.acquire();
			expect(session.id).toBeDefined();
			expect(typeof session.exec).toBe("function");

			const stats = pool.stats();
			expect(stats.active).toBe(1);
			expect(stats.idle).toBe(0);

			pool.release(session);

			const stats2 = pool.stats();
			expect(stats2.active).toBe(0);
			expect(stats2.idle).toBe(1);

			await pool.destroy();
		} finally {
			await shutdown();
		}
	});

	test("acquire reuses idle sessions", async () => {
		const config = testPaths();
		const ctx = mockContext({
			newPage: mock(() => Promise.resolve(mockPage())),
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			const pool = createPool({
				socketPath: config.socketPath,
				maxSessions: 5,
			});

			const s1 = await pool.acquire();
			const s1Id = s1.id;
			pool.release(s1);

			const s2 = await pool.acquire();
			expect(s2.id).toBe(s1Id);

			await pool.destroy();
		} finally {
			await shutdown();
		}
	});

	test("pool exhaustion throws error", async () => {
		const config = testPaths();
		const ctx = mockContext({
			newPage: mock(() => Promise.resolve(mockPage())),
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			const pool = createPool({
				socketPath: config.socketPath,
				maxSessions: 2,
			});

			await pool.acquire();
			await pool.acquire();

			try {
				await pool.acquire();
				expect(true).toBe(false); // Should not reach here
			} catch (err) {
				expect((err as Error).message).toContain("Pool exhausted");
			}

			await pool.destroy();
		} finally {
			await shutdown();
		}
	});

	test("exec sends commands to session", async () => {
		const config = testPaths();
		const ctx = mockContext({
			newPage: mock(() =>
				Promise.resolve(
					mockPage({
						url: mock(() => "https://session-url.com"),
					}),
				),
			),
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			const pool = createPool({
				socketPath: config.socketPath,
				maxSessions: 5,
			});

			const session = await pool.acquire();
			const r = await session.exec("url");
			expect(r.ok).toBe(true);

			await pool.destroy();
		} finally {
			await shutdown();
		}
	});

	test("stats returns correct counts", async () => {
		const config = testPaths();
		const ctx = mockContext({
			newPage: mock(() => Promise.resolve(mockPage())),
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			const pool = createPool({
				socketPath: config.socketPath,
				maxSessions: 10,
			});

			expect(pool.stats()).toEqual({
				active: 0,
				idle: 0,
				total: 0,
				maxSessions: 10,
			});

			const s1 = await pool.acquire();
			const _s2 = await pool.acquire();

			expect(pool.stats()).toEqual({
				active: 2,
				idle: 0,
				total: 2,
				maxSessions: 10,
			});

			pool.release(s1);

			expect(pool.stats()).toEqual({
				active: 1,
				idle: 1,
				total: 2,
				maxSessions: 10,
			});

			await pool.destroy();
		} finally {
			await shutdown();
		}
	});

	test("destroy closes all sessions", async () => {
		const config = testPaths();
		const closedPage = mockPage({
			close: mock(() => Promise.resolve()),
		});
		const ctx = mockContext({
			newPage: mock(() => Promise.resolve(closedPage)),
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			const pool = createPool({
				socketPath: config.socketPath,
				maxSessions: 5,
			});

			await pool.acquire();
			await pool.acquire();

			await pool.destroy();

			expect(pool.stats()).toEqual({
				active: 0,
				idle: 0,
				total: 0,
				maxSessions: 5,
			});
		} finally {
			await shutdown();
		}
	});

	test("warmUp pre-creates sessions", async () => {
		const config = testPaths();
		const ctx = mockContext({
			newPage: mock(() => Promise.resolve(mockPage())),
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			const pool = createPool({
				socketPath: config.socketPath,
				maxSessions: 10,
			});

			await pool.warmUp(3);

			expect(pool.stats()).toEqual({
				active: 0,
				idle: 3,
				total: 3,
				maxSessions: 10,
			});

			await pool.destroy();
		} finally {
			await shutdown();
		}
	});
});
