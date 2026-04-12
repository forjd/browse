import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import type { BrowseConfig } from "../src/config.ts";
import { type ServerDeps, startServer } from "../src/daemon.ts";
import type { LifecycleConfig } from "../src/lifecycle.ts";
import type { Response } from "../src/protocol.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-flow-daemon-template-init");
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
): Promise<Response> {
	return new Promise((resolve, reject) => {
		const client = connect(socketPath, () => {
			client.write(`${JSON.stringify({ cmd, args })}\n`);
		});

		let buffer = "";
		client.on("data", (chunk) => {
			buffer += chunk.toString();
			const newlineIndex = buffer.indexOf("\n");
			if (newlineIndex === -1) return;
			const line = buffer.slice(0, newlineIndex).trim();
			client.end();
			resolve(JSON.parse(line));
		});
		client.on("error", reject);
	});
}

const BASE_CONFIG: BrowseConfig = {
	environments: {
		staging: {
			loginUrl: "https://example.com/login",
			userEnvVar: "STAGING_USER",
			passEnvVar: "STAGING_PASS",
			successCondition: { urlContains: "/dashboard" },
		},
	},
};

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("daemon flow init", () => {
	test("accepts --force for flow init and writes the template file", async () => {
		const config = testPaths();
		const projectDir = join(config.dir, "project");
		mkdirSync(projectDir, { recursive: true });
		const configPath = join(projectDir, "browse.config.json");
		writeFileSync(
			configPath,
			`${JSON.stringify(BASE_CONFIG, null, 2)}\n`,
			"utf-8",
		);

		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page, {
				config: BASE_CONFIG,
				configPath,
			}),
			config,
			async () => {},
		);

		try {
			const response = await sendCommand(config.socketPath, "flow", [
				"init",
				"smoke",
				"release-smoke",
				"--force",
			]);
			expect(response.ok).toBe(true);
			expect(existsSync(join(projectDir, "flows", "release-smoke.json"))).toBe(
				true,
			);
		} finally {
			await shutdown();
		}
	});
});
