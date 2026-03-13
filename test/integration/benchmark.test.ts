import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { startServer } from "../../src/daemon.ts";
import type { LifecycleConfig } from "../../src/lifecycle.ts";
import type { Response } from "../../src/protocol.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-benchmark");
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
		screenshot: mock(() => Promise.resolve(Buffer.from(""))),
		locator: mock(() => ({
			click: mock(() => Promise.resolve()),
			fill: mock(() => Promise.resolve()),
			ariaSnapshot: mock(() => Promise.resolve('- button "Test"')),
		})),
		evaluate: mock(() => Promise.resolve(500)),
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

describe("integration: benchmark", () => {
	test("benchmark completes without error", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			{ page, context: mockContext(), config: null },
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "benchmark", [
				"--iterations",
				"2",
			]);
			expect(response.ok).toBe(true);
		} finally {
			await shutdown();
		}
	});

	test("benchmark output contains all expected operations", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			{ page, context: mockContext(), config: null },
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "benchmark", [
				"--iterations",
				"2",
			]);
			expect(response.ok).toBe(true);
			if (response.ok) {
				expect(response.data).toContain("goto (local)");
				expect(response.data).toContain("snapshot");
				expect(response.data).toContain("screenshot");
				expect(response.data).toContain("click");
				expect(response.data).toContain("fill");
			}
		} finally {
			await shutdown();
		}
	});

	test("benchmark output contains p50, p95, p99", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			{ page, context: mockContext(), config: null },
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "benchmark", [
				"--iterations",
				"2",
			]);
			expect(response.ok).toBe(true);
			if (response.ok) {
				expect(response.data).toContain("p50:");
				expect(response.data).toContain("p95:");
				expect(response.data).toContain("p99:");
			}
		} finally {
			await shutdown();
		}
	});

	test("benchmark is not subject to timeout", async () => {
		const config = testPaths();
		const page = mockPage();
		// Set a very low config timeout — benchmark should not be affected
		const { shutdown } = await startServer(
			{
				page,
				context: mockContext(),
				config: { environments: {}, timeout: 1 },
			},
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "benchmark", [
				"--iterations",
				"2",
			]);
			expect(response.ok).toBe(true);
		} finally {
			await shutdown();
		}
	});
});
