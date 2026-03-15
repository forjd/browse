import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import type { ServerDeps } from "../src/daemon.ts";
import { startServer } from "../src/daemon.ts";
import type { LifecycleConfig } from "../src/lifecycle.ts";
import type { Response } from "../src/protocol.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-new-cmds");
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
		evaluate: mock(() => Promise.resolve({})),
		frames: mock(() => [
			{
				name: mock(() => ""),
				url: mock(() => "https://example.com"),
			},
		]),
		route: mock(() => Promise.resolve()),
		unroute: mock(() => Promise.resolve()),
		pdf: mock(() => Promise.resolve()),
		locator: mock(() => ({
			count: mock(() => Promise.resolve(5)),
			evaluate: mock(() => Promise.resolve("<div>HTML</div>")),
		})),
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

describe("ping command", () => {
	test("responds with pong", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "ping");
			expect(r).toEqual({ ok: true, data: "pong" });
		} finally {
			await shutdown();
		}
	});
});

describe("status command", () => {
	test("returns daemon status info", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "status");
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("url:");
				expect(r.data).toContain("sessions:");
				expect(r.data).toContain("uptime:");
			}
		} finally {
			await shutdown();
		}
	});
});

describe("dialog command", () => {
	test("status returns no pending dialog", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "dialog", ["status"]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("No pending dialog");
			}
		} finally {
			await shutdown();
		}
	});

	test("accept without pending dialog returns error", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "dialog", ["accept"]);
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error).toContain("No pending dialog");
			}
		} finally {
			await shutdown();
		}
	});

	test("dismiss without pending dialog returns error", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "dialog", ["dismiss"]);
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error).toContain("No pending dialog");
			}
		} finally {
			await shutdown();
		}
	});

	test("auto-accept sets mode", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "dialog", ["auto-accept"]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("accept");
			}
		} finally {
			await shutdown();
		}
	});

	test("auto-dismiss sets mode", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "dialog", [
				"auto-dismiss",
			]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("dismiss");
			}
		} finally {
			await shutdown();
		}
	});

	test("auto-off disables auto mode", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "dialog", ["auto-off"]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("disabled");
			}
		} finally {
			await shutdown();
		}
	});

	test("missing subcommand returns usage", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "dialog");
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error).toContain("Usage");
			}
		} finally {
			await shutdown();
		}
	});
});

describe("frame command", () => {
	test("list shows available frames", async () => {
		const config = testPaths();
		const mainFrame = {
			name: mock(() => ""),
			url: mock(() => "https://example.com"),
		};
		const page = mockPage({
			frames: mock(() => [mainFrame]),
			mainFrame: mock(() => mainFrame),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "frame", ["list"]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("main");
				expect(r.data).toContain("example.com");
			}
		} finally {
			await shutdown();
		}
	});

	test("main returns main frame info", async () => {
		const config = testPaths();
		const mainFrame = {
			name: mock(() => ""),
			url: mock(() => "https://example.com/main"),
		};
		const page = mockPage({
			mainFrame: mock(() => mainFrame),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "frame", ["main"]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("Main frame");
				expect(r.data).toContain("example.com/main");
			}
		} finally {
			await shutdown();
		}
	});

	test("missing subcommand returns usage", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "frame");
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error).toContain("Usage");
			}
		} finally {
			await shutdown();
		}
	});
});

describe("intercept command", () => {
	test("list with no rules shows empty", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "intercept", ["list"]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("No intercept rules");
			}
		} finally {
			await shutdown();
		}
	});

	test("add creates an intercept rule", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "intercept", [
				"add",
				"**/api/*",
				"--status",
				"200",
				"--body",
				'{"mock":true}',
			]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("Intercept added");
				expect(r.data).toContain("**/api/*");
			}
		} finally {
			await shutdown();
		}
	});

	test("clear removes all rules", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			await sendCommand(config.socketPath, "intercept", ["add", "**/api/*"]);
			const r = await sendCommand(config.socketPath, "intercept", ["clear"]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("cleared");
			}
		} finally {
			await shutdown();
		}
	});

	test("missing subcommand returns usage", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "intercept");
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error).toContain("Usage");
			}
		} finally {
			await shutdown();
		}
	});
});

describe("cookies command", () => {
	test("returns no cookies when empty", async () => {
		const config = testPaths();
		const page = mockPage();
		const ctx = mockContext({
			cookies: mock(() => Promise.resolve([])),
		});
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "cookies");
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("No cookies");
			}
		} finally {
			await shutdown();
		}
	});

	test("returns cookies when present", async () => {
		const config = testPaths();
		const page = mockPage();
		const ctx = mockContext({
			cookies: mock(() =>
				Promise.resolve([
					{
						name: "session",
						value: "abc123",
						domain: ".example.com",
						path: "/",
						secure: true,
						httpOnly: true,
					},
				]),
			),
		});
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "cookies");
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("session=abc123");
				expect(r.data).toContain("example.com");
			}
		} finally {
			await shutdown();
		}
	});

	test("filters by domain", async () => {
		const config = testPaths();
		const page = mockPage();
		const ctx = mockContext({
			cookies: mock(() =>
				Promise.resolve([
					{
						name: "a",
						value: "1",
						domain: ".foo.com",
						path: "/",
						secure: false,
						httpOnly: false,
					},
					{
						name: "b",
						value: "2",
						domain: ".bar.com",
						path: "/",
						secure: false,
						httpOnly: false,
					},
				]),
			),
		});
		const { shutdown } = await startServer(
			mockDeps(page, { context: ctx }),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "cookies", [
				"--domain",
				"foo.com",
			]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("a=1");
				expect(r.data).not.toContain("b=2");
			}
		} finally {
			await shutdown();
		}
	});
});

describe("storage command", () => {
	test("missing subcommand returns usage", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "storage");
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error).toContain("Usage");
			}
		} finally {
			await shutdown();
		}
	});

	test("local returns localStorage entries", async () => {
		const config = testPaths();
		const page = mockPage({
			evaluate: mock(() => Promise.resolve({ token: "abc" })),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "storage", ["local"]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("token = abc");
			}
		} finally {
			await shutdown();
		}
	});

	test("session returns sessionStorage entries", async () => {
		const config = testPaths();
		const page = mockPage({
			evaluate: mock(() => Promise.resolve({ sid: "xyz" })),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "storage", ["session"]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("sid = xyz");
			}
		} finally {
			await shutdown();
		}
	});

	test("empty storage returns message", async () => {
		const config = testPaths();
		const page = mockPage({
			evaluate: mock(() => Promise.resolve({})),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "storage", ["local"]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("No localStorage entries");
			}
		} finally {
			await shutdown();
		}
	});
});

describe("title command", () => {
	test("returns page title", async () => {
		const config = testPaths();
		const page = mockPage({
			title: mock(() => Promise.resolve("My Page")),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "title");
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toBe("My Page");
			}
		} finally {
			await shutdown();
		}
	});
});

describe("html command", () => {
	test("returns full page HTML without args", async () => {
		const config = testPaths();
		const page = mockPage({
			evaluate: mock(() => Promise.resolve("<html><body>Hello</body></html>")),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "html");
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("<html>");
			}
		} finally {
			await shutdown();
		}
	});
});

describe("element-count command", () => {
	test("returns count for CSS selector", async () => {
		const config = testPaths();
		const page = mockPage({
			locator: mock(() => ({
				count: mock(() => Promise.resolve(3)),
			})),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "element-count", [
				".item",
			]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toBe("3");
			}
		} finally {
			await shutdown();
		}
	});

	test("missing selector returns usage", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "element-count");
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error).toContain("Usage");
			}
		} finally {
			await shutdown();
		}
	});
});

describe("download command", () => {
	test("missing subcommand returns usage", async () => {
		const config = testPaths();
		const page = mockPage();
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const r = await sendCommand(config.socketPath, "download");
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error).toContain("Usage");
			}
		} finally {
			await shutdown();
		}
	});
});

describe("pdf command", () => {
	test("exports page as PDF", async () => {
		const config = testPaths();
		const page = mockPage({
			pdf: mock(() => Promise.resolve()),
		});
		const { shutdown } = await startServer(
			mockDeps(page),
			config,
			async () => {},
		);
		try {
			const outPath = join(config.dir, "test.pdf");
			const r = await sendCommand(config.socketPath, "pdf", [outPath]);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.data).toContain("PDF saved");
				expect(r.data).toContain(outPath);
			}
		} finally {
			await shutdown();
		}
	});
});
