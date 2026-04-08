import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, validateConfig } from "../src/config.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-config-p4");

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

const MINIMAL_ENVS = {
	environments: {
		staging: {
			loginUrl: "https://example.com/login",
			userEnvVar: "U",
			passEnvVar: "P",
			successCondition: { urlContains: "/dashboard" },
		},
	},
};

describe("Phase 4 config — flows", () => {
	test("accepts config with flows", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				signup: {
					description: "Register a new user",
					variables: ["base_url", "email"],
					steps: [
						{ goto: "{{base_url}}/register" },
						{ fill: { Email: "{{email}}" } },
						{ click: "Submit" },
					],
				},
			},
		});
		expect(result).toBeNull();
	});

	test("accepts flows without optional description and variables", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				simple: {
					steps: [{ goto: "https://example.com" }],
				},
			},
		});
		expect(result).toBeNull();
	});

	test("rejects flow missing steps array", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				broken: {} as any,
			},
		});
		expect(result).toContain("broken");
		expect(result).toContain("steps");
	});

	test("rejects flow with empty steps array", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				empty: { steps: [] },
			},
		});
		expect(result).toContain("empty");
		expect(result).toContain("steps");
	});

	test("rejects flow with invalid step shape", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				bad: { steps: [{ badKey: "value" }] },
			},
		});
		expect(result).toContain("bad");
		expect(result).toContain("step");
	});

	test("accepts all valid step types", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				everything: {
					steps: [
						{ goto: "https://example.com" },
						{ click: "Submit" },
						{ click: { name: "Yes", index: 1 } },
						{ click: { name: "Yes", near: "Selling?" } },
						{ click: { selector: ".btn" } },
						{ fill: { Email: "test@test.com" } },
						{ fill: { Email: { value: "test@test.com", index: 0 } } },
						{ fill: { selector: "input", value: "test" } },
						{ select: { Role: "Admin" } },
						{ select: { Role: { value: "Admin", index: 0 } } },
						{ select: { selector: "#role", value: "Admin" } },
						{ screenshot: true },
						{ screenshot: "/tmp/shot.png" },
						{ console: "error" },
						{ network: true },
						{ wait: { urlContains: "/done" } },
						{ assert: { visible: ".btn" } },
						{ login: "staging" },
						{ snapshot: true },
					],
				},
			},
		});
		expect(result).toBeNull();
	});

	test("loads config with flows from file", () => {
		const path = join(TEST_DIR, "browse.config.json");
		const config = {
			...MINIMAL_ENVS,
			flows: {
				signup: {
					description: "Register",
					variables: ["base_url"],
					steps: [{ goto: "{{base_url}}/register" }],
				},
			},
		};
		writeFileSync(path, JSON.stringify(config));

		const result = loadConfig(path);
		expect(result.error).toBeNull();
		expect(result.config?.flows?.signup.steps).toHaveLength(1);
	});
});

describe("Flow step disambiguation validation", () => {
	// --- click ---
	test("accepts click with name + index", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: { steps: [{ click: { name: "Yes", index: 1 } }] },
			},
		});
		expect(result).toBeNull();
	});

	test("accepts click with name + near", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: {
					steps: [{ click: { name: "Yes", near: "Are you selling?" } }],
				},
			},
		});
		expect(result).toBeNull();
	});

	test("accepts click with selector", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: { steps: [{ click: { selector: ".q2 button" } }] },
			},
		});
		expect(result).toBeNull();
	});

	test("accepts click with name only (object form)", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: { steps: [{ click: { name: "Submit" } }] },
			},
		});
		expect(result).toBeNull();
	});

	test("rejects click with both index and near", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: {
					steps: [{ click: { name: "Yes", index: 1, near: "Question" } }],
				},
			},
		});
		expect(result).toContain("index");
		expect(result).toContain("near");
	});

	test("rejects click with negative index", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: { steps: [{ click: { name: "Yes", index: -1 } }] },
			},
		});
		expect(result).toContain("index");
	});

	test("rejects click with non-integer index", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: { steps: [{ click: { name: "Yes", index: 1.5 } }] },
			},
		});
		expect(result).toContain("index");
	});

	test("rejects click with empty object", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: { steps: [{ click: {} }] },
			},
		});
		expect(result).not.toBeNull();
	});

	test("rejects click with selector + name", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: {
					steps: [{ click: { selector: ".btn", name: "Submit" } }],
				},
			},
		});
		expect(result).not.toBeNull();
	});

	test("rejects click with wrong type", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: { steps: [{ click: 123 }] },
			},
		});
		expect(result).not.toBeNull();
	});

	// --- fill ---
	test("accepts fill with selector + value", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: {
					steps: [{ fill: { selector: "input.email", value: "a@b.com" } }],
				},
			},
		});
		expect(result).toBeNull();
	});

	test("accepts fill with per-field index", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: {
					steps: [{ fill: { Email: { value: "a@b.com", index: 1 } } }],
				},
			},
		});
		expect(result).toBeNull();
	});

	test("rejects fill selector without value", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: { steps: [{ fill: { selector: "input" } }] },
			},
		});
		expect(result).not.toBeNull();
	});

	test("rejects fill with per-field negative index", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: {
					steps: [{ fill: { Email: { value: "a@b.com", index: -1 } } }],
				},
			},
		});
		expect(result).toContain("index");
	});

	// --- select ---
	test("accepts select with selector + value", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: {
					steps: [{ select: { selector: "#country", value: "UK" } }],
				},
			},
		});
		expect(result).toBeNull();
	});

	test("accepts select with per-field index", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				test: {
					steps: [{ select: { Country: { value: "UK", index: 0 } } }],
				},
			},
		});
		expect(result).toBeNull();
	});
});

describe("Phase 4 config — permissions", () => {
	test("accepts config with permissions", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			permissions: {
				"Create User": {
					page: "{{base_url}}/admin/users/new",
					granted: { visible: "form.create-user" },
					denied: { textContains: "Access denied" },
				},
			},
		});
		expect(result).toBeNull();
	});

	test("rejects permission missing page", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			permissions: {
				"Create User": {
					granted: { visible: "form" },
					denied: { textContains: "denied" },
				} as any,
			},
		});
		expect(result).toContain("Create User");
		expect(result).toContain("page");
	});

	test("rejects permission missing granted", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			permissions: {
				"Create User": {
					page: "/admin",
					denied: { textContains: "denied" },
				} as any,
			},
		});
		expect(result).toContain("Create User");
		expect(result).toContain("granted");
	});

	test("rejects permission missing denied", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			permissions: {
				"Create User": {
					page: "/admin",
					granted: { visible: "form" },
				} as any,
			},
		});
		expect(result).toContain("Create User");
		expect(result).toContain("denied");
	});

	test("accepts all valid assert conditions in permissions", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			permissions: {
				P1: {
					page: "/p1",
					granted: { visible: ".btn" },
					denied: { notVisible: ".btn" },
				},
				P2: {
					page: "/p2",
					granted: { textContains: "yes" },
					denied: { textNotContains: "yes" },
				},
				P3: {
					page: "/p3",
					granted: { urlContains: "/ok" },
					denied: { urlPattern: "^/denied" },
				},
				P4: {
					page: "/p4",
					granted: { elementText: { selector: "h1", contains: "OK" } },
					denied: { elementCount: { selector: ".err", count: 1 } },
				},
			},
		});
		expect(result).toBeNull();
	});
});

describe("Phase 4 config — healthcheck", () => {
	test("accepts config with healthcheck", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			healthcheck: {
				pages: [
					{
						url: "{{base_url}}/api/health",
						name: "API Health",
						screenshot: false,
					},
					{ url: "{{base_url}}/dashboard", name: "Dashboard" },
				],
			},
		});
		expect(result).toBeNull();
	});

	test("rejects healthcheck with empty pages", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			healthcheck: { pages: [] },
		});
		expect(result).toContain("healthcheck");
		expect(result).toContain("pages");
	});

	test("rejects healthcheck page missing url", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			healthcheck: {
				pages: [{ name: "Missing URL" } as any],
			},
		});
		expect(result).toContain("url");
	});

	test("accepts healthcheck pages with assertions", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			healthcheck: {
				pages: [
					{
						url: "{{base_url}}/health",
						assertions: [{ textContains: "ok" }],
					},
				],
			},
		});
		expect(result).toBeNull();
	});
});

describe("Phase 4 config — backwards compatibility", () => {
	test("Phase 3 config without Phase 4 fields is still valid", () => {
		const result = validateConfig(MINIMAL_ENVS);
		expect(result).toBeNull();
	});

	test("config with all Phase 4 sections together is valid", () => {
		const result = validateConfig({
			...MINIMAL_ENVS,
			flows: {
				signup: {
					steps: [{ goto: "https://example.com/register" }],
				},
			},
			permissions: {
				"Create User": {
					page: "/admin",
					granted: { visible: "form" },
					denied: { textContains: "denied" },
				},
			},
			healthcheck: {
				pages: [{ url: "{{base_url}}/health" }],
			},
		});
		expect(result).toBeNull();
	});
});
