import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { startServer } from "../src/daemon.ts";
import type { LifecycleConfig } from "../src/lifecycle.ts";
import type { Response } from "../src/protocol.ts";

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
		...overrides,
	} as never;
}

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

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
		const { shutdown } = await startServer(page, config, shutdownFn);

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
		const { shutdown } = await startServer(page, config, async () => {});

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
		const { shutdown } = await startServer(page, config, async () => {});

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
		await startServer(page, config, shutdownCb);

		const response = await sendCommand(config.socketPath, "quit");
		expect(response).toEqual({ ok: true, data: "Daemon stopped." });

		// Give it a moment to run the scheduled shutdown
		await Bun.sleep(200);
		expect(shutdownCb).toHaveBeenCalled();
		expect(existsSync(config.socketPath)).toBe(false);
	});

	test("cleans up socket and pid on shutdown", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(page, config, async () => {});

		// Files exist while running
		expect(existsSync(config.socketPath)).toBe(true);

		await shutdown();

		expect(existsSync(config.socketPath)).toBe(false);
	});

	test("handles malformed JSON gracefully", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(page, config, async () => {});

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
		const { shutdown } = await startServer(page, config, async () => {});

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
		const { shutdown } = await startServer(page, config, async () => {});

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
		const { shutdown } = await startServer(page, config, async () => {});

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
		const { shutdown } = await startServer(page, config, async () => {});

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
});
