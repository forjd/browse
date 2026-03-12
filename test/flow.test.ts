import { describe, expect, test } from "bun:test";
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
