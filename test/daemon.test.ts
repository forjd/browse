import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import type { ServerDeps } from "../src/daemon.ts";
import { startServer } from "../src/daemon.ts";
import type { LifecycleConfig } from "../src/lifecycle.ts";
import type { Response } from "../src/protocol.ts";
import {
	persistDaemonState,
	setStateFilePathForTesting,
} from "../src/session-state.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-daemon");
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

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	setStateFilePathForTesting(null);
	rmSync(TEST_DIR, { recursive: true, force: true });
});

/** Poll until the given mock has been called, or the timeout expires. */
async function waitUntilCalled(
	mockFn: { mock: { calls: unknown[] } },
	timeoutMs = 2000,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline && !mockFn.mock.calls.length) {
		await Bun.sleep(20);
	}
	return mockFn.mock.calls.length > 0;
}

function sendCommand(
	socketPath: string,
	cmd: string,
	args: string[] = [],
): Promise<Response> {
	return new Promise((resolve, reject) => {
		const client = connect(socketPath, () => {
			client.write(`${JSON.stringify({ cmd, args })}\n`);
		});

		let data = "";
		client.on("data", (chunk) => {
			data += chunk.toString();
		});
		client.on("end", () => {
			try {
				resolve(JSON.parse(data.trim()));
			} catch {
				reject(new Error(`Failed to parse response: ${data}`));
			}
		});
		client.on("error", reject);
	});
}

describe("daemon server", () => {
	test("responds to unknown commands with an error", async () => {
		const config = testPaths();
		const page = mockPage();
		const shutdownFn = mock(() => Promise.resolve());
		const { shutdown } = await startServer(mockDeps(page), config, shutdownFn);

		try {
			const response = await sendCommand(config.socketPath, "dance");
			expect(response).toEqual({
				ok: false,
				error: "Unknown command: dance",
			});
		} finally {
			await shutdown();
		}
	});

	test("handles goto command", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "goto", [
				"https://example.com",
			]);
			expect(response).toEqual({ ok: true, data: "Mock Title" });
			expect(page.goto).toHaveBeenCalledWith("https://example.com", {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});
		} finally {
			await shutdown();
		}
	});

	test("handles text command", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "text");
			expect(response).toEqual({ ok: true, data: "Mock body text" });
		} finally {
			await shutdown();
		}
	});

	test("handles quit command and cleans up", async () => {
		const config = testPaths();
		// Create the PID file so cleanup can remove it
		writeFileSync(config.pidPath, "12345");
		const page = mockPage();
		const shutdownCb = mock(() => Promise.resolve());
		const exitCb = mock(() => {});
		await startServer(mockDeps(page), config, shutdownCb, {
			onExit: exitCb,
		});

		const response = await sendCommand(config.socketPath, "quit");
		expect(response).toEqual({ ok: true, data: "Daemon stopped." });

		// Shutdown fires after the response is flushed to the socket.
		await waitUntilCalled(shutdownCb);
		expect(shutdownCb).toHaveBeenCalled();
		expect(exitCb).toHaveBeenCalled();
		expect(existsSync(config.socketPath)).toBe(false);
		expect(existsSync(config.pidPath)).toBe(false);
	});

	test("quit makes server unreachable after shutdown completes", async () => {
		const config = testPaths();
		writeFileSync(config.pidPath, "12345");
		const page = mockPage();
		const shutdownCb = mock(() => Promise.resolve());
		await startServer(mockDeps(page), config, shutdownCb, {
			onExit: () => {},
		});

		await sendCommand(config.socketPath, "quit");

		// Wait for shutdown to complete
		await waitUntilCalled(shutdownCb);

		// Server should be closed — new connections should fail
		const err = await sendCommand(config.socketPath, "ping").catch(
			(e: Error) => e,
		);
		expect(err).toBeInstanceOf(Error);
	});

	test("concurrent quit commands only trigger shutdown once", async () => {
		const config = testPaths();
		writeFileSync(config.pidPath, "12345");
		const page = mockPage();
		const shutdownCb = mock(() => Promise.resolve());
		const exitCb = mock(() => {});
		await startServer(mockDeps(page), config, shutdownCb, {
			onExit: exitCb,
		});

		// Fire two quit commands concurrently. The second may arrive after
		// the first has already triggered shutdown and closed the server,
		// so we tolerate connection errors on the second call.
		const results = await Promise.allSettled([
			sendCommand(config.socketPath, "quit"),
			sendCommand(config.socketPath, "quit"),
		]);

		// At least one must succeed with the quit response
		const successes = results.filter(
			(r): r is PromiseFulfilledResult<Response> =>
				r.status === "fulfilled" &&
				r.value.ok === true &&
				r.value.data === "Daemon stopped.",
		);
		expect(successes.length).toBeGreaterThanOrEqual(1);

		// The other may also succeed, or fail with a connection error
		for (const r of results) {
			if (r.status === "rejected") {
				expect(r.reason).toBeInstanceOf(Error);
			}
		}

		await waitUntilCalled(exitCb);

		// shutdownOnce guard ensures shutdown runs exactly once
		expect(shutdownCb).toHaveBeenCalledTimes(1);
		expect(exitCb).toHaveBeenCalledTimes(1);
	});

	test("cleans up socket and pid on shutdown", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		// Files exist while running
		expect(existsSync(config.socketPath)).toBe(true);

		await shutdown();

		expect(existsSync(config.socketPath)).toBe(false);
	});

	test("handles malformed JSON gracefully", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "" as never);
			// parseRequest will throw on this
			expect(response.ok).toBe(false);
		} finally {
			await shutdown();
		}
	});

	test("handles screenshot command", async () => {
		const config = testPaths();
		const page = mockPage({
			screenshot: mock(() => Promise.resolve()),
			evaluate: mock(() => Promise.resolve(500)),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "screenshot", [
				join(config.dir, "test-shot.png"),
			]);
			expect(response.ok).toBe(true);
			if (response.ok) {
				expect(response.data).toContain("test-shot.png");
			}
		} finally {
			await shutdown();
		}
	});

	test("handles console command with empty buffer", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "console");
			expect(response).toEqual({ ok: true, data: "No console messages." });
		} finally {
			await shutdown();
		}
	});

	test("handles network command with empty buffer", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "network");
			expect(response).toEqual({ ok: true, data: "No failed requests." });
		} finally {
			await shutdown();
		}
	});

	test("handles Playwright errors without crashing", async () => {
		const config = testPaths();
		const page = mockPage({
			goto: mock(() =>
				Promise.reject(new Error("net::ERR_CONNECTION_REFUSED")),
			),
			title: mock(() => Promise.resolve("")),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "goto", [
				"https://bad.invalid",
			]);
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("net::ERR_CONNECTION_REFUSED");
			}

			// Server should still be alive — send another command
			const response2 = await sendCommand(config.socketPath, "text");
			expect(response2.ok).toBe(true);
		} finally {
			await shutdown();
		}
	});

	test("handles tab list command", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "tab", ["list"]);
			expect(response.ok).toBe(true);
			if (response.ok) {
				expect(response.data).toContain("[active]");
				expect(response.data).toContain("1.");
			}
		} finally {
			await shutdown();
		}
	});

	test("handles auth-state save command", async () => {
		const config = testPaths();
		const page = mockPage();
		const ctx = mockContext();
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			const savePath = join(config.dir, "auth.json");
			const response = await sendCommand(config.socketPath, "auth-state", [
				"save",
				savePath,
			]);
			expect(response.ok).toBe(true);
			if (response.ok) {
				expect(response.data).toContain(savePath);
			}
		} finally {
			await shutdown();
		}
	});

	test("does not restore persisted session state unless enabled", async () => {
		const config = testPaths();
		const stateFile = join(config.dir, "session-state.json");
		setStateFilePathForTesting(stateFile);
		await persistDaemonState({
			version: 1,
			updatedAt: new Date().toISOString(),
			sessions: [
				{
					name: "default",
					isolated: false,
					activeTabIndex: 0,
					tabs: [{ url: "https://restored.example.com" }],
				},
			],
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			expect(page.goto).not.toHaveBeenCalled();
		} finally {
			await shutdown();
		}
	});

	test("restores persisted session state when enabled", async () => {
		const config = testPaths();
		const stateFile = join(config.dir, "session-state.json");
		setStateFilePathForTesting(stateFile);
		await persistDaemonState({
			version: 1,
			updatedAt: new Date().toISOString(),
			sessions: [
				{
					name: "default",
					isolated: false,
					activeTabIndex: 0,
					tabs: [{ url: "https://restored.example.com" }],
				},
			],
		});
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
			{ persistSessionState: true },
		);

		try {
			expect(page.goto).toHaveBeenCalledWith("https://restored.example.com", {
				waitUntil: "domcontentloaded",
			});
		} finally {
			await shutdown();
		}
	});

	test("rejects unknown flags on goto", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "goto", [
				"https://example.com",
				"--headless",
			]);
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("Unknown flag");
				expect(response.error).toContain("--headless");
				expect(response.error).toContain("browse help goto");
			}
		} finally {
			await shutdown();
		}
	});

	test("rejects unknown flags on screenshot", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "screenshot", [
				"--verbose",
			]);
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("--verbose");
			}
		} finally {
			await shutdown();
		}
	});

	test("accepts known flags on screenshot", async () => {
		const config = testPaths();
		const page = mockPage({
			screenshot: mock(() => Promise.resolve()),
			evaluate: mock(() => Promise.resolve(500)),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "screenshot", [
				"--viewport",
			]);
			expect(response.ok).toBe(true);
		} finally {
			await shutdown();
		}
	});

	test("rejects multiple unknown flags", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "goto", [
				"https://example.com",
				"--headless",
				"--verbose",
			]);
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("Unknown flags");
				expect(response.error).toContain("--headless");
				expect(response.error).toContain("--verbose");
			}
		} finally {
			await shutdown();
		}
	});

	test("skips flag validation for eval (freeform args)", async () => {
		const config = testPaths();
		const page = mockPage({
			evaluate: mock(() => Promise.resolve("test")),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "eval", [
				"document.querySelector('--custom')",
			]);
			expect(response.ok).toBe(true);
		} finally {
			await shutdown();
		}
	});

	test("goto with --viewport resizes before navigating", async () => {
		const config = testPaths();
		const page = mockPage({
			setViewportSize: mock(() => Promise.resolve()),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "goto", [
				"https://example.com",
				"--viewport",
				"320x568",
			]);
			expect(response.ok).toBe(true);
			expect(page.setViewportSize).toHaveBeenCalledWith({
				width: 320,
				height: 568,
			});
			expect(page.goto).toHaveBeenCalledWith("https://example.com", {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});
		} finally {
			await shutdown();
		}
	});

	test("goto with --preset resizes before navigating", async () => {
		const config = testPaths();
		const page = mockPage({
			setViewportSize: mock(() => Promise.resolve()),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "goto", [
				"https://example.com",
				"--preset",
				"mobile",
			]);
			expect(response.ok).toBe(true);
			expect(page.setViewportSize).toHaveBeenCalledWith({
				width: 375,
				height: 667,
			});
		} finally {
			await shutdown();
		}
	});

	test("goto with --device resizes before navigating", async () => {
		const config = testPaths();
		const page = mockPage({
			setViewportSize: mock(() => Promise.resolve()),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "goto", [
				"https://example.com",
				"--device",
				"iPhone SE",
			]);
			expect(response.ok).toBe(true);
			expect(page.setViewportSize).toHaveBeenCalled();
			expect(page.goto).toHaveBeenCalled();
		} finally {
			await shutdown();
		}
	});

	test("goto with invalid --viewport returns error", async () => {
		const config = testPaths();
		const page = mockPage({
			setViewportSize: mock(() => Promise.resolve()),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "goto", [
				"https://example.com",
				"--viewport",
				"notasize",
			]);
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("Expected WxH");
			}
		} finally {
			await shutdown();
		}
	});

	test("goto includes viewport size in response", async () => {
		const config = testPaths();
		const page = mockPage({
			setViewportSize: mock(() => Promise.resolve()),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "goto", [
				"https://example.com",
				"--viewport",
				"320x568",
			]);
			expect(response.ok).toBe(true);
			if (response.ok) {
				expect(response.data).toContain("320x568");
			}
		} finally {
			await shutdown();
		}
	});

	test("handles login command without config", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "login", [
				"--env",
				"staging",
			]);
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("browse.config.json");
			}
		} finally {
			await shutdown();
		}
	});

	test("handles url command", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "url");
			expect(response.ok).toBe(true);
			if (response.ok) {
				expect(response.data).toBe("https://example.com");
			}
		} finally {
			await shutdown();
		}
	});

	test("handles back command", async () => {
		const config = testPaths();
		const cdpClient = {
			send: mock(() => Promise.resolve({ currentIndex: 1, entries: [{}, {}] })),
			detach: mock(() => Promise.resolve()),
		};
		const page = mockPage({
			goBack: mock(() => Promise.resolve()),
			context: () => ({
				newCDPSession: mock(() => Promise.resolve(cdpClient)),
			}),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "back");
			expect(response.ok).toBe(true);
		} finally {
			await shutdown();
		}
	});

	test("handles forward command", async () => {
		const config = testPaths();
		const cdpClient = {
			send: mock(() => Promise.resolve({ currentIndex: 0, entries: [{}, {}] })),
			detach: mock(() => Promise.resolve()),
		};
		const page = mockPage({
			goForward: mock(() => Promise.resolve()),
			context: () => ({
				newCDPSession: mock(() => Promise.resolve(cdpClient)),
			}),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "forward");
			expect(response.ok).toBe(true);
		} finally {
			await shutdown();
		}
	});

	test("handles reload command", async () => {
		const config = testPaths();
		const page = mockPage({
			reload: mock(() => Promise.resolve()),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "reload");
			expect(response.ok).toBe(true);
		} finally {
			await shutdown();
		}
	});

	test("handles wait command with timeout", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "wait", ["50"]);
			expect(response.ok).toBe(true);
		} finally {
			await shutdown();
		}
	});

	test("handles attr command with missing ref", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "attr", [
				".btn",
				"class",
			]);
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("@");
			}
		} finally {
			await shutdown();
		}
	});

	test("handles flow command without config", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "flow", ["list"]);
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("browse.config.json");
			}
		} finally {
			await shutdown();
		}
	});

	test("handles healthcheck command without config", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "healthcheck");
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("browse.config.json");
			}
		} finally {
			await shutdown();
		}
	});

	test("propagates config validation error to flow command", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, {
				configError:
					"Invalid browse.config.json: missing 'environments' object.",
			}),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "flow", ["list"]);
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("Invalid browse.config.json");
				expect(response.error).not.toContain("No browse.config.json found");
			}
		} finally {
			await shutdown();
		}
	});

	test("handles assert command with missing args", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "assert");
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("Usage");
			}
		} finally {
			await shutdown();
		}
	});

	test("handles wipe command", async () => {
		const config = testPaths();
		const page = mockPage({
			evaluate: mock(() => Promise.resolve()),
		});
		const ctx = mockContext({
			clearCookies: mock(() => Promise.resolve()),
		});
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "wipe");
			expect(response.ok).toBe(true);
			if (response.ok) {
				expect(response.data).toContain("Session wiped");
			}
		} finally {
			await shutdown();
		}
	});

	test("handles page-eval command with missing expression", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "page-eval");
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("Missing expression");
			}
		} finally {
			await shutdown();
		}
	});

	test("handles request with custom timeout", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			// Send a command with a timeout field in the payload
			const response: Response = await new Promise((resolve, reject) => {
				const client = connect(config.socketPath, () => {
					client.write(
						`${JSON.stringify({ cmd: "text", args: [], timeout: 30000 })}\n`,
					);
				});
				let data = "";
				client.on("data", (chunk) => {
					data += chunk.toString();
				});
				client.on("end", () => {
					try {
						resolve(JSON.parse(data.trim()));
					} catch {
						reject(new Error(`Failed to parse: ${data}`));
					}
				});
				client.on("error", reject);
			});
			expect(response.ok).toBe(true);
		} finally {
			await shutdown();
		}
	});
});
