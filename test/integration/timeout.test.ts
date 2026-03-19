import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import type { ServerDeps } from "../../src/daemon.ts";
import { startServer } from "../../src/daemon.ts";
import type { LifecycleConfig } from "../../src/lifecycle.ts";
import type { Response } from "../../src/protocol.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-timeout");
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

function mockPage(overrides: Record<string, unknown> = {}) {
	return {
		goto: mock(() => Promise.resolve()),
		title: mock(() => Promise.resolve("Mock Title")),
		innerText: mock(() => Promise.resolve("Mock body text")),
		on: mock(() => {}),
		mainFrame: mock(() => ({})),
		url: mock(() => "https://example.com"),
		...overrides,
	} as never;
}

function mockContext(overrides: Record<string, unknown> = {}) {
	return {
		storageState: mock(() => Promise.resolve({ cookies: [], origins: [] })),
		addCookies: mock(() => Promise.resolve()),
		newPage: mock(() => Promise.resolve(mockPage())),
		clearCookies: mock(() => Promise.resolve()),
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
	timeout?: number,
): Promise<Response> {
	return new Promise((resolve, reject) => {
		const payload: Record<string, unknown> = { cmd, args };
		if (timeout) payload.timeout = timeout;

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
				reject(new Error(`Failed to parse response: ${data}`));
			}
		});
		client.on("error", reject);
	});
}

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("integration: timeout", () => {
	test("command that exceeds timeout returns timeout error", async () => {
		const config = testPaths();
		const page = mockPage({
			goto: mock(() => new Promise((resolve) => setTimeout(resolve, 5000))),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(
				config.socketPath,
				"goto",
				["https://slow.example.com"],
				100, // 100ms timeout
			);
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("Command timed out after 100ms");
			}
		} finally {
			await shutdown();
		}
	});

	test("--timeout flag overrides default", async () => {
		const config = testPaths();
		const page = mockPage({
			goto: mock(() => new Promise((resolve) => setTimeout(resolve, 5000))),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(
				config.socketPath,
				"goto",
				["https://slow.example.com"],
				80,
			);
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("80ms");
			}
		} finally {
			await shutdown();
		}
	});

	test("config file timeout is respected", async () => {
		const config = testPaths();
		const page = mockPage({
			goto: mock(() => new Promise((resolve) => setTimeout(resolve, 5000))),
		});
		const { shutdown } = await startServer(
			mockDeps(page, { config: { environments: {}, timeout: 150 } }),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "goto", [
				"https://slow.example.com",
			]);
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.error).toContain("150ms");
			}
		} finally {
			await shutdown();
		}
	});

	test("quit is not subject to timeout", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, { config: { environments: {}, timeout: 1 } }),
			config,
			async () => {},
			{ onExit: () => {} },
		);

		try {
			const response = await sendCommand(config.socketPath, "quit");
			expect(response).toEqual({ ok: true, data: "Daemon stopped." });
		} finally {
			// shutdown already triggered by quit, but call anyway for cleanup
			try {
				await shutdown();
			} catch {}
		}
	});
});
