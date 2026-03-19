import { describe, expect, mock, test } from "bun:test";
import { handleFlow } from "../src/commands/flow.ts";
import type { BrowseConfig } from "../src/config.ts";

const BASE_CONFIG: BrowseConfig = {
	environments: {
		staging: {
			loginUrl: "https://example.com/login",
			userEnvVar: "U",
			passEnvVar: "P",
			successCondition: { urlContains: "/dashboard" },
		},
	},
	flows: {
		signup: {
			description: "Register a new user account",
			variables: ["base_url", "test_email", "test_pass"],
			steps: [
				{ goto: "{{base_url}}/register" },
				{ fill: { Email: "{{test_email}}" } },
				{ click: "Submit" },
			],
		},
		simple: {
			description: "A simple flow",
			steps: [{ goto: "https://example.com" }],
		},
	},
};

describe("handleFlow — flow list", () => {
	test("lists all flows with descriptions and variables", async () => {
		const result = await handleFlow(BASE_CONFIG, null as any, ["list"]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("signup");
			expect(result.data).toContain("Register a new user account");
			expect(result.data).toContain("base_url");
			expect(result.data).toContain("test_email");
			expect(result.data).toContain("simple");
			expect(result.data).toContain("A simple flow");
		}
	});

	test("returns message when no flows configured", async () => {
		const configNoFlows: BrowseConfig = {
			environments: BASE_CONFIG.environments,
		};
		const result = await handleFlow(configNoFlows, null as any, ["list"]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("No flows defined");
		}
	});

	test("returns error when no config", async () => {
		const result = await handleFlow(null, null as any, ["list"]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("browse.config.json");
		}
	});

	test("returns validation error when config is invalid", async () => {
		const result = await handleFlow(null, null as any, ["list"], undefined, {
			configError: "Invalid browse.config.json: missing 'environments' object.",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Invalid browse.config.json");
			expect(result.error).toContain("missing 'environments' object");
			expect(result.error).not.toContain("No browse.config.json found");
		}
	});
});

describe("handleFlow — missing flow", () => {
	test("returns error for unknown flow name", async () => {
		const result = await handleFlow(BASE_CONFIG, null as any, ["nonexistent"]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown flow: 'nonexistent'");
			expect(result.error).toContain("signup");
			expect(result.error).toContain("simple");
		}
	});

	test("shows '(none)' when no flows are configured", async () => {
		const configNoFlows: BrowseConfig = {
			environments: BASE_CONFIG.environments,
			flows: {},
		};
		const result = await handleFlow(configNoFlows, null as any, [
			"nonexistent",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("(none)");
			expect(result.error).not.toEndWith("Available: .");
		}
	});
});

describe("handleFlow — missing variables", () => {
	test("returns error listing missing variables", async () => {
		const result = await handleFlow(BASE_CONFIG, null as any, [
			"signup",
			"--var",
			"base_url=https://example.com",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Missing variables");
			expect(result.error).toContain("test_email");
			expect(result.error).toContain("test_pass");
			// base_url was provided, so it should not be in the missing list
			const missingLine = result.error.split("\n")[0];
			expect(missingLine).not.toContain("base_url");
		}
	});
});

describe("handleFlow — no flow name", () => {
	test("returns usage error with no args", async () => {
		const result = await handleFlow(BASE_CONFIG, null as any, []);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});
});

describe("handleFlow — reporter validation", () => {
	test("rejects invalid reporter", async () => {
		const page = null as any;
		const result = await handleFlow(BASE_CONFIG, page, [
			"simple",
			"--reporter",
			"csv",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Invalid reporter 'csv'");
			expect(result.error).toContain("json");
			expect(result.error).toContain("markdown");
			expect(result.error).toContain("junit");
		}
	});

	test("rejects --reporter with no value", async () => {
		const page = null as any;
		const result = await handleFlow(BASE_CONFIG, page, [
			"simple",
			"--reporter",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Missing value for --reporter");
		}
	});
});

// --- handleFlow with deps / execution tests ---

function createMockDeps() {
	return {
		consoleBuffer: {
			push: mock(() => {}),
			drain: mock(() => []),
			clear: mock(() => {}),
		},
		networkBuffer: {
			push: mock(() => {}),
			drain: mock(() => []),
			clear: mock(() => {}),
		},
	};
}

function createMockFlowPage() {
	return {
		url: () => "https://example.com",
		goto: mock(async () => null),
		innerText: mock(async () => ""),
		locator: (_sel: string) => ({
			first: () => ({
				isVisible: mock(async () => true),
				innerText: mock(async () => ""),
			}),
			count: mock(async () => 0),
		}),
		getByRole: (_role: string, _opts?: any) => ({
			first: () => ({
				isVisible: mock(async () => true),
				innerText: mock(async () => ""),
				click: mock(async () => {}),
				fill: mock(async () => {}),
			}),
			count: mock(async () => 1),
			click: mock(async () => {}),
			fill: mock(async () => {}),
		}),
	} as any;
}

describe("handleFlow — no deps", () => {
	test("returns internal error when deps is undefined", async () => {
		const page = createMockFlowPage();
		const result = await handleFlow(BASE_CONFIG, page, ["simple"]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Internal error");
			expect(result.error).toContain("console and network buffers");
		}
	});
});

describe("handleFlow — running flows", () => {
	test("runs a simple flow successfully", async () => {
		const page = createMockFlowPage();
		const deps = createMockDeps();
		const result = await handleFlow(BASE_CONFIG, page, ["simple"], deps as any);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("simple");
		}
	});

	test("returns JSON output with --reporter json", async () => {
		const page = createMockFlowPage();
		const deps = createMockDeps();
		const result = await handleFlow(
			BASE_CONFIG,
			page,
			["simple", "--reporter", "json"],
			deps as any,
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			const parsed = JSON.parse(result.data);
			expect(parsed.name).toBe("simple");
			expect(parsed.status).toBe("passed");
			expect(parsed.steps).toHaveLength(1);
		}
	});

	test("returns Markdown output with --reporter markdown", async () => {
		const page = createMockFlowPage();
		const deps = createMockDeps();
		const result = await handleFlow(
			BASE_CONFIG,
			page,
			["simple", "--reporter", "markdown"],
			deps as any,
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("# Flow: simple");
			expect(result.data).toContain("1/1 steps passed");
		}
	});

	test("returns error report when a step fails", async () => {
		// Use a flow with an assert step that will fail
		const failConfig: BrowseConfig = {
			environments: BASE_CONFIG.environments,
			flows: {
				"check-banner": {
					description: "Verify banner is visible",
					steps: [{ assert: { visible: ".banner" } }],
				},
			},
		};
		// The mock page has no visible selectors, so visible assertion will fail
		const page = createMockFlowPage();
		page.locator = (_sel: string) => ({
			first: () => ({
				isVisible: mock(async () => false),
				innerText: mock(async () => ""),
			}),
			count: mock(async () => 0),
		});
		const deps = createMockDeps();
		const result = await handleFlow(
			failConfig,
			page,
			["check-banner"],
			deps as any,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("check-banner");
		}
	});
});
