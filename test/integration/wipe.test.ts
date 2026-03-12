import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import type { ServerDeps } from "../../src/daemon.ts";
import { startServer } from "../../src/daemon.ts";
import type { LifecycleConfig } from "../../src/lifecycle.ts";
import type { Response } from "../../src/protocol.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-wipe");
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
		evaluate: mock(() => Promise.resolve()),
		close: mock(() => Promise.resolve()),
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

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("integration: wipe", () => {
	test("wipe returns success message", async () => {
		const config = testPaths();
		const page = mockPage();
		const ctx = mockContext();
		const { shutdown } = await startServer(
			{ page, context: ctx, config: null },
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "wipe");
			expect(response).toEqual({ ok: true, data: "Session wiped." });
		} finally {
			await shutdown();
		}
	});

	test("wipe clears cookies via context", async () => {
		const config = testPaths();
		const page = mockPage();
		const ctx = mockContext();
		const { shutdown } = await startServer(
			{ page, context: ctx, config: null },
			config,
			async () => {},
		);

		try {
			await sendCommand(config.socketPath, "wipe");
			expect(ctx.clearCookies).toHaveBeenCalled();
		} finally {
			await shutdown();
		}
	});

	test("wipe then console returns empty", async () => {
		const config = testPaths();
		const page = mockPage();
		const ctx = mockContext();
		const { shutdown } = await startServer(
			{ page, context: ctx, config: null },
			config,
			async () => {},
		);

		try {
			await sendCommand(config.socketPath, "wipe");
			const consoleResponse = await sendCommand(config.socketPath, "console");
			expect(consoleResponse).toEqual({
				ok: true,
				data: "No console messages.",
			});
		} finally {
			await shutdown();
		}
	});

	test("wipe then network returns empty", async () => {
		const config = testPaths();
		const page = mockPage();
		const ctx = mockContext();
		const { shutdown } = await startServer(
			{ page, context: ctx, config: null },
			config,
			async () => {},
		);

		try {
			await sendCommand(config.socketPath, "wipe");
			const networkResponse = await sendCommand(config.socketPath, "network");
			expect(networkResponse).toEqual({
				ok: true,
				data: "No failed requests.",
			});
		} finally {
			await shutdown();
		}
	});
});
