import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ServerDeps } from "../src/daemon.ts";
import { startServer } from "../src/daemon.ts";
import type { LifecycleConfig } from "../src/lifecycle.ts";
import type { Response } from "../src/protocol.ts";
import { sendSocketRequest } from "./support/socket-command.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-session");
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

function sendCommand(
	socketPath: string,
	cmd: string,
	args: string[] = [],
	session?: string,
	timeoutMs = 5_000,
): Promise<Response> {
	const payload: Record<string, unknown> = { cmd, args };
	if (session) payload.session = session;
	return sendSocketRequest<Response>(socketPath, payload, timeoutMs);
}

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("session management", () => {
	test("session list returns default session when no sessions created", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "session", [
				"list",
			]);
			expect(response.ok).toBe(true);
			if (response.ok) {
				expect(response.data).toContain("default");
			}
		} finally {
			await shutdown();
		}
	});

	test("commands sent with session field use that session's context", async () => {
		const config = testPaths();
		const page = mockPage();
		const ctx = mockContext();
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			// Commands without a session field work on default session
			const r1 = await sendCommand(config.socketPath, "url");
			expect(r1.ok).toBe(true);

			// Commands with session field also work
			const r2 = await sendCommand(config.socketPath, "url", [], "default");
			expect(r2.ok).toBe(true);
		} finally {
			await shutdown();
		}
	});

	test("session create makes a new isolated session", async () => {
		const config = testPaths();
		const newPage = mockPage({
			url: mock(() => "about:blank"),
			title: mock(() => Promise.resolve("New Page")),
		});
		const ctx = mockContext({
			newPage: mock(() => Promise.resolve(newPage)),
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			const r = await sendCommand(config.socketPath, "session", [
				"create",
				"worker-1",
			]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("worker-1");
			}

			// List should show both
			const list = await sendCommand(config.socketPath, "session", ["list"]);
			expect(list.ok).toBe(true);
			if (list.ok) {
				expect(list.data).toContain("default");
				expect(list.data).toContain("worker-1");
			}
		} finally {
			await shutdown();
		}
	});

	test("isolated session creation stays lazy until first routed command", async () => {
		const config = testPaths();
		const lazyPage = mockPage({
			url: mock(() => "https://lazy.example.com"),
			title: mock(() => Promise.resolve("Lazy Page")),
		});
		const isolatedContext = mockContext({
			newPage: mock(() => Promise.resolve(lazyPage)),
		});
		const browser = {
			newContext: mock(() => Promise.resolve(isolatedContext)),
		};
		const ctx = mockContext({
			browser: mock(() => browser),
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			const created = await sendCommand(config.socketPath, "session", [
				"create",
				"lazy-worker",
				"--isolated",
			]);
			expect(created.ok).toBe(true);
			expect(browser.newContext).not.toHaveBeenCalled();

			const list = await sendCommand(config.socketPath, "session", ["list"]);
			expect(list.ok).toBe(true);
			if (list.ok) {
				expect(list.data).toContain("lazy-worker");
			}
			expect(browser.newContext).not.toHaveBeenCalled();

			const url = await sendCommand(
				config.socketPath,
				"url",
				[],
				"lazy-worker",
			);
			expect(url).toEqual({ ok: true, data: "https://lazy.example.com" });
			expect(browser.newContext).toHaveBeenCalledTimes(1);
			expect(isolatedContext.newPage).toHaveBeenCalledTimes(1);
		} finally {
			await shutdown();
		}
	});

	test("closing a never-used isolated session does not allocate its context", async () => {
		const config = testPaths();
		const browser = {
			newContext: mock(() => Promise.resolve(mockContext())),
		};
		const ctx = mockContext({
			browser: mock(() => browser),
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			await sendCommand(config.socketPath, "session", [
				"create",
				"lazy-close",
				"--isolated",
			]);
			const closed = await sendCommand(config.socketPath, "session", [
				"close",
				"lazy-close",
			]);
			expect(closed.ok).toBe(true);
			expect(browser.newContext).not.toHaveBeenCalled();
		} finally {
			await shutdown();
		}
	});

	test("session create rejects duplicate names", async () => {
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
			await sendCommand(config.socketPath, "session", ["create", "worker-1"]);
			const r = await sendCommand(config.socketPath, "session", [
				"create",
				"worker-1",
			]);
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error).toContain("already exists");
			}
		} finally {
			await shutdown();
		}
	});

	test("session close removes a session", async () => {
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
			await sendCommand(config.socketPath, "session", ["create", "temp"]);
			const r = await sendCommand(config.socketPath, "session", [
				"close",
				"temp",
			]);
			expect(r.ok).toBe(true);

			// List should only show default
			const list = await sendCommand(config.socketPath, "session", ["list"]);
			if (list.ok) {
				expect(list.data).not.toContain("temp");
			}
		} finally {
			await shutdown();
		}
	});

	test("session close rejects closing default session", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const r = await sendCommand(config.socketPath, "session", [
				"close",
				"default",
			]);
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error).toContain("Cannot close");
			}
		} finally {
			await shutdown();
		}
	});

	test("commands routed to named session use that session's page", async () => {
		const config = testPaths();
		const sessionPage = mockPage({
			url: mock(() => "https://session-page.com"),
		});
		const ctx = mockContext({
			newPage: mock(() => Promise.resolve(sessionPage)),
		});
		const page = mockPage({
			url: mock(() => "https://default-page.com"),
		});
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			await sendCommand(config.socketPath, "session", ["create", "worker-1"]);

			// Default session returns default page URL
			const r1 = await sendCommand(config.socketPath, "url");
			expect(r1.ok).toBe(true);
			if (r1.ok) {
				expect(r1.data).toBe("https://default-page.com");
			}

			// Named session returns its page URL
			const r2 = await sendCommand(config.socketPath, "url", [], "worker-1");
			expect(r2.ok).toBe(true);
			if (r2.ok) {
				expect(r2.data).toBe("https://session-page.com");
			}
		} finally {
			await shutdown();
		}
	});

	test("session close on non-existent session returns error", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const r = await sendCommand(config.socketPath, "session", [
				"close",
				"ghost",
			]);
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error).toContain("ghost");
			}
		} finally {
			await shutdown();
		}
	});

	test("command to non-existent session returns error", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const r = await sendCommand(config.socketPath, "url", [], "ghost");
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error).toContain("ghost");
			}
		} finally {
			await shutdown();
		}
	});

	test("session create without name returns error", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const r = await sendCommand(config.socketPath, "session", ["create"]);
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error).toContain("name");
			}
		} finally {
			await shutdown();
		}
	});

	test("session create --isolated marks the session isolated without immediate context allocation", async () => {
		const config = testPaths();
		const isolatedPage = mockPage({
			url: mock(() => "about:blank"),
		});
		const isolatedCtx = mockContext({
			newPage: mock(() => Promise.resolve(isolatedPage)),
			close: mock(() => Promise.resolve()),
			addInitScript: mock(() => Promise.resolve()),
		});
		const browser = {
			newContext: mock(() => Promise.resolve(isolatedCtx)),
		};
		const ctx = mockContext({
			newPage: mock(() => Promise.resolve(mockPage())),
			browser: mock(() => browser),
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, {
				context: ctx,
				stealthOpts: {
					userAgent: "Test Agent",
					navigatorPlatform: "Linux",
					chromeMajor: "120",
				},
			}),
			config,
			async () => {},
		);

		try {
			const r = await sendCommand(config.socketPath, "session", [
				"create",
				"iso-1",
				"--isolated",
			]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("iso-1");
				expect(r.data).toContain("isolated");
			}

			expect(browser.newContext).not.toHaveBeenCalled();

			// List should show isolated marker
			const list = await sendCommand(config.socketPath, "session", ["list"]);
			if (list.ok) {
				expect(list.data).toContain("[isolated]");
			}
		} finally {
			await shutdown();
		}
	});

	test("closing isolated session closes the context", async () => {
		const config = testPaths();
		const isolatedPage = mockPage({
			url: mock(() => "about:blank"),
			close: mock(() => Promise.resolve()),
		});
		const isolatedCtxClose = mock(() => Promise.resolve());
		const isolatedCtx = mockContext({
			newPage: mock(() => Promise.resolve(isolatedPage)),
			close: isolatedCtxClose,
			addInitScript: mock(() => Promise.resolve()),
		});
		const browser = {
			newContext: mock(() => Promise.resolve(isolatedCtx)),
		};
		const ctx = mockContext({
			newPage: mock(() => Promise.resolve(mockPage())),
			browser: mock(() => browser),
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, {
				context: ctx,
				stealthOpts: {
					userAgent: "Test Agent",
					navigatorPlatform: "Linux",
					chromeMajor: "120",
				},
			}),
			config,
			async () => {},
		);

		try {
			await sendCommand(config.socketPath, "session", [
				"create",
				"iso-close",
				"--isolated",
			]);
			await sendCommand(config.socketPath, "url", [], "iso-close");
			const r = await sendCommand(config.socketPath, "session", [
				"close",
				"iso-close",
			]);
			expect(r.ok).toBe(true);
			expect(isolatedCtxClose).toHaveBeenCalled();
		} finally {
			await shutdown();
		}
	});
});
