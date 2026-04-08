import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FlowConfig } from "../src/config.ts";
import {
	discoverFlowDirectories,
	type FlowSource,
	loadFlowFile,
	loadFlowsFromDirectories,
	mergeFlows,
} from "../src/flow-loader.ts";

let testDir: string;

beforeEach(() => {
	testDir = join(tmpdir(), `browse-flow-loader-test-${Date.now()}`);
	mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
	rmSync(testDir, { recursive: true, force: true });
});

// --- loadFlowFile ---

describe("loadFlowFile", () => {
	test("loads a valid flow file", () => {
		const flowPath = join(testDir, "checkout.json");
		writeFileSync(
			flowPath,
			JSON.stringify({
				description: "Checkout flow",
				variables: ["base_url"],
				steps: [{ goto: "{{base_url}}/checkout" }, { click: "Place Order" }],
			}),
		);

		const { flow, error } = loadFlowFile(flowPath);
		expect(error).toBeNull();
		expect(flow).not.toBeNull();
		expect(flow?.description).toBe("Checkout flow");
		expect(flow?.variables).toEqual(["base_url"]);
		expect(flow?.steps).toHaveLength(2);
	});

	test("loads a minimal flow file (steps only)", () => {
		const flowPath = join(testDir, "simple.json");
		writeFileSync(
			flowPath,
			JSON.stringify({
				steps: [{ goto: "https://example.com" }],
			}),
		);

		const { flow, error } = loadFlowFile(flowPath);
		expect(error).toBeNull();
		expect(flow).not.toBeNull();
		expect(flow?.steps).toHaveLength(1);
		expect(flow?.description).toBeUndefined();
		expect(flow?.variables).toBeUndefined();
	});

	test("returns error for invalid JSON", () => {
		const flowPath = join(testDir, "bad.json");
		writeFileSync(flowPath, "{ not valid json }");

		const { flow, error } = loadFlowFile(flowPath);
		expect(flow).toBeNull();
		expect(error).toContain("bad.json");
		expect(error).toContain("parse");
	});

	test("returns error for missing steps", () => {
		const flowPath = join(testDir, "no-steps.json");
		writeFileSync(flowPath, JSON.stringify({ description: "Missing steps" }));

		const { flow, error } = loadFlowFile(flowPath);
		expect(flow).toBeNull();
		expect(error).toContain("steps");
	});

	test("returns error for empty steps array", () => {
		const flowPath = join(testDir, "empty-steps.json");
		writeFileSync(flowPath, JSON.stringify({ steps: [] }));

		const { flow, error } = loadFlowFile(flowPath);
		expect(flow).toBeNull();
		expect(error).toContain("empty");
	});

	test("returns error for invalid step type", () => {
		const flowPath = join(testDir, "bad-step.json");
		writeFileSync(
			flowPath,
			JSON.stringify({ steps: [{ invalidAction: "foo" }] }),
		);

		const { flow, error } = loadFlowFile(flowPath);
		expect(flow).toBeNull();
		expect(error).toContain("invalid type");
	});

	test("returns error for non-existent file", () => {
		const { flow, error } = loadFlowFile(join(testDir, "missing.json"));
		expect(flow).toBeNull();
		expect(error).toContain("missing.json");
	});

	test("validates nested if/while steps", () => {
		const flowPath = join(testDir, "conditional.json");
		writeFileSync(
			flowPath,
			'{"steps":[{"if":{"condition":{"elementVisible":"#modal"},"then":[{"click":"Close"}]}}]}',
		);

		const { flow, error } = loadFlowFile(flowPath);
		expect(error).toBeNull();
		expect(flow).not.toBeNull();
	});

	test("includes filename in error messages", () => {
		const flowPath = join(testDir, "my-flow.json");
		writeFileSync(flowPath, JSON.stringify({ steps: [{ badStep: true }] }));

		const { error } = loadFlowFile(flowPath);
		expect(error).toContain("my-flow.json");
	});
});

// --- discoverFlowDirectories ---

describe("discoverFlowDirectories", () => {
	test("returns local flows dir when it exists beside config", () => {
		const flowsDir = join(testDir, "flows");
		mkdirSync(flowsDir);
		const configPath = join(testDir, "browse.config.json");

		const dirs = discoverFlowDirectories(configPath);
		expect(dirs).toContainEqual(
			expect.objectContaining({ path: flowsDir, type: "local" }),
		);
	});

	test("returns empty array when no flows directory exists", () => {
		const configPath = join(testDir, "browse.config.json");
		const dirs = discoverFlowDirectories(configPath);
		// Filter out global dir which may or may not exist
		const localDirs = dirs.filter((d) => d.type === "local");
		expect(localDirs).toHaveLength(0);
	});

	test("returns empty array when config path is null", () => {
		const dirs = discoverFlowDirectories(null);
		const localDirs = dirs.filter((d) => d.type === "local");
		expect(localDirs).toHaveLength(0);
	});
});

// --- loadFlowsFromDirectories ---

describe("loadFlowsFromDirectories", () => {
	test("loads all JSON files from a directory", () => {
		const flowsDir = join(testDir, "flows");
		mkdirSync(flowsDir);
		writeFileSync(
			join(flowsDir, "login.json"),
			JSON.stringify({ steps: [{ goto: "/login" }] }),
		);
		writeFileSync(
			join(flowsDir, "checkout.json"),
			JSON.stringify({
				description: "Checkout",
				steps: [{ goto: "/checkout" }],
			}),
		);

		const { flows, errors } = loadFlowsFromDirectories([
			{ path: flowsDir, type: "local" },
		]);
		expect(errors).toHaveLength(0);
		expect(Object.keys(flows)).toContain("login");
		expect(Object.keys(flows)).toContain("checkout");
		expect(flows.checkout.description).toBe("Checkout");
	});

	test("ignores non-JSON files", () => {
		const flowsDir = join(testDir, "flows");
		mkdirSync(flowsDir);
		writeFileSync(
			join(flowsDir, "valid.json"),
			JSON.stringify({ steps: [{ goto: "/page" }] }),
		);
		writeFileSync(join(flowsDir, "readme.md"), "# Not a flow");
		writeFileSync(join(flowsDir, "script.ts"), "console.log('hi')");

		const { flows, errors } = loadFlowsFromDirectories([
			{ path: flowsDir, type: "local" },
		]);
		expect(errors).toHaveLength(0);
		expect(Object.keys(flows)).toEqual(["valid"]);
	});

	test("derives flow name from filename without extension", () => {
		const flowsDir = join(testDir, "flows");
		mkdirSync(flowsDir);
		writeFileSync(
			join(flowsDir, "my-flow-name.json"),
			JSON.stringify({ steps: [{ goto: "/page" }] }),
		);

		const { flows } = loadFlowsFromDirectories([
			{ path: flowsDir, type: "local" },
		]);
		expect(Object.keys(flows)).toEqual(["my-flow-name"]);
	});

	test("higher-precedence directory wins on name collision", () => {
		const localDir = join(testDir, "local-flows");
		const globalDir = join(testDir, "global-flows");
		mkdirSync(localDir);
		mkdirSync(globalDir);

		writeFileSync(
			join(localDir, "smoke.json"),
			JSON.stringify({
				description: "Local smoke",
				steps: [{ goto: "/local" }],
			}),
		);
		writeFileSync(
			join(globalDir, "smoke.json"),
			JSON.stringify({
				description: "Global smoke",
				steps: [{ goto: "/global" }],
			}),
		);

		const { flows } = loadFlowsFromDirectories([
			{ path: localDir, type: "local" },
			{ path: globalDir, type: "global" },
		]);
		expect(flows.smoke.description).toBe("Local smoke");
	});

	test("collects errors without stopping", () => {
		const flowsDir = join(testDir, "flows");
		mkdirSync(flowsDir);
		writeFileSync(
			join(flowsDir, "good.json"),
			JSON.stringify({ steps: [{ goto: "/page" }] }),
		);
		writeFileSync(join(flowsDir, "bad.json"), "not json");
		writeFileSync(
			join(flowsDir, "also-good.json"),
			JSON.stringify({ steps: [{ click: "Submit" }] }),
		);

		const { flows, errors } = loadFlowsFromDirectories([
			{ path: flowsDir, type: "local" },
		]);
		expect(Object.keys(flows)).toContain("good");
		expect(Object.keys(flows)).toContain("also-good");
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("bad.json");
	});

	test("returns sources map with correct entries", () => {
		const localDir = join(testDir, "local-flows");
		const globalDir = join(testDir, "global-flows");
		mkdirSync(localDir);
		mkdirSync(globalDir);

		writeFileSync(
			join(localDir, "local-flow.json"),
			JSON.stringify({ steps: [{ goto: "/local" }] }),
		);
		writeFileSync(
			join(globalDir, "global-flow.json"),
			JSON.stringify({ steps: [{ goto: "/global" }] }),
		);

		const { sources } = loadFlowsFromDirectories([
			{ path: localDir, type: "local" },
			{ path: globalDir, type: "global" },
		]);
		expect(sources.get("local-flow")).toEqual({
			type: "file",
			path: join(localDir, "local-flow.json"),
			directory: "local",
		});
		expect(sources.get("global-flow")).toEqual({
			type: "file",
			path: join(globalDir, "global-flow.json"),
			directory: "global",
		});
	});

	test("rejects flow files with invalid names", () => {
		const flowsDir = join(testDir, "flows");
		mkdirSync(flowsDir);
		writeFileSync(
			join(flowsDir, ".hidden.json"),
			JSON.stringify({ steps: [{ goto: "/page" }] }),
		);
		writeFileSync(
			join(flowsDir, "valid.json"),
			JSON.stringify({ steps: [{ goto: "/page" }] }),
		);

		const { flows, errors } = loadFlowsFromDirectories([
			{ path: flowsDir, type: "local" },
		]);
		expect(Object.keys(flows)).toEqual(["valid"]);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain(".hidden");
	});

	test("handles empty directory", () => {
		const flowsDir = join(testDir, "flows");
		mkdirSync(flowsDir);

		const { flows, errors } = loadFlowsFromDirectories([
			{ path: flowsDir, type: "local" },
		]);
		expect(Object.keys(flows)).toHaveLength(0);
		expect(errors).toHaveLength(0);
	});
});

// --- mergeFlows ---

describe("mergeFlows", () => {
	const fileFlows: Record<string, FlowConfig> = {
		checkout: { steps: [{ goto: "/checkout" }] },
		signup: { steps: [{ goto: "/signup" }] },
	};

	const fileSources = new Map<string, FlowSource>([
		[
			"checkout",
			{
				type: "file",
				path: "/project/flows/checkout.json",
				directory: "local",
			},
		],
		[
			"signup",
			{
				type: "file",
				path: "/project/flows/signup.json",
				directory: "local",
			},
		],
	]);

	test("inline flows override file flows", () => {
		const inlineFlows: Record<string, FlowConfig> = {
			checkout: {
				description: "Inline checkout",
				steps: [{ goto: "/inline-checkout" }],
			},
		};

		const { merged, sources } = mergeFlows(inlineFlows, fileFlows, fileSources);
		expect(merged.checkout.description).toBe("Inline checkout");
		expect(merged.checkout.steps[0]).toEqual({ goto: "/inline-checkout" });
		expect(sources.get("checkout")).toEqual({ type: "inline" });
	});

	test("file-only flows appear in merged result", () => {
		const { merged } = mergeFlows({}, fileFlows, fileSources);
		expect(merged.checkout.steps[0]).toEqual({ goto: "/checkout" });
		expect(merged.signup.steps[0]).toEqual({ goto: "/signup" });
	});

	test("handles undefined inline flows", () => {
		const { merged } = mergeFlows(undefined, fileFlows, fileSources);
		expect(Object.keys(merged)).toContain("checkout");
		expect(Object.keys(merged)).toContain("signup");
	});

	test("handles empty file flows", () => {
		const inlineFlows: Record<string, FlowConfig> = {
			login: { steps: [{ goto: "/login" }] },
		};

		const { merged, sources } = mergeFlows(inlineFlows, {}, new Map());
		expect(Object.keys(merged)).toEqual(["login"]);
		expect(sources.get("login")).toEqual({ type: "inline" });
	});

	test("inline flows are not overridden by file flows with same name", () => {
		const inlineFlows: Record<string, FlowConfig> = {
			checkout: { steps: [{ goto: "/inline" }] },
			signup: { steps: [{ goto: "/inline-signup" }] },
		};

		const { merged } = mergeFlows(inlineFlows, fileFlows, fileSources);
		expect(merged.checkout.steps[0]).toEqual({ goto: "/inline" });
		expect(merged.signup.steps[0]).toEqual({ goto: "/inline-signup" });
	});
});
