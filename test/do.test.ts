import { describe, expect, test } from "bun:test";
import {
	buildSystemPrompt,
	buildUserPrompt,
	capCommands,
	formatDryRun,
	formatPlan,
	parseCommandList,
	parseDoFlags,
} from "../src/commands/do.ts";

describe("parseDoFlags", () => {
	test("parses positional args as instruction", () => {
		const result = parseDoFlags(["click", "the", "login", "button"]);
		expect(result.positional).toEqual(["click", "the", "login", "button"]);
		expect(result.dryRun).toBe(false);
		expect(result.verbose).toBe(false);
		expect(result.provider).toBeUndefined();
		expect(result.model).toBeUndefined();
		expect(result.baseUrl).toBeUndefined();
		expect(result.env).toBeUndefined();
	});

	test("parses --dry-run flag", () => {
		const result = parseDoFlags(["navigate", "to", "home", "--dry-run"]);
		expect(result.positional).toEqual(["navigate", "to", "home"]);
		expect(result.dryRun).toBe(true);
	});

	test("parses --verbose flag", () => {
		const result = parseDoFlags(["--verbose", "do", "something"]);
		expect(result.verbose).toBe(true);
		expect(result.positional).toEqual(["do", "something"]);
	});

	test("parses --provider flag", () => {
		const result = parseDoFlags(["--provider", "openai", "click", "login"]);
		expect(result.provider).toBe("openai");
		expect(result.positional).toEqual(["click", "login"]);
	});

	test("parses --model flag", () => {
		const result = parseDoFlags(["--model", "gpt-4o", "do", "stuff"]);
		expect(result.model).toBe("gpt-4o");
		expect(result.positional).toEqual(["do", "stuff"]);
	});

	test("parses --base-url flag", () => {
		const result = parseDoFlags([
			"--base-url",
			"https://openrouter.ai/api/v1",
			"search",
		]);
		expect(result.baseUrl).toBe("https://openrouter.ai/api/v1");
		expect(result.positional).toEqual(["search"]);
	});

	test("parses --env flag", () => {
		const result = parseDoFlags(["--env", "staging", "log", "in"]);
		expect(result.env).toBe("staging");
		expect(result.positional).toEqual(["log", "in"]);
	});

	test("handles all flags combined", () => {
		const result = parseDoFlags([
			"--dry-run",
			"--verbose",
			"--provider",
			"anthropic",
			"--model",
			"claude-sonnet-4-20250514",
			"--base-url",
			"https://example.com",
			"--env",
			"prod",
			"fill",
			"form",
		]);
		expect(result.dryRun).toBe(true);
		expect(result.verbose).toBe(true);
		expect(result.provider).toBe("anthropic");
		expect(result.model).toBe("claude-sonnet-4-20250514");
		expect(result.baseUrl).toBe("https://example.com");
		expect(result.env).toBe("prod");
		expect(result.positional).toEqual(["fill", "form"]);
	});

	test("ignores unknown flags starting with --", () => {
		const result = parseDoFlags(["--unknown", "hello"]);
		expect(result.positional).toEqual(["hello"]);
	});
});

describe("buildSystemPrompt", () => {
	test("includes available commands", () => {
		const prompt = buildSystemPrompt(undefined);
		expect(prompt).toContain("Available browse commands:");
		expect(prompt).toContain("goto <url>");
		expect(prompt).toContain("snapshot");
		expect(prompt).toContain("click <@ref>");
	});

	test("includes max steps rule", () => {
		const prompt = buildSystemPrompt(undefined);
		expect(prompt).toContain("Maximum 20 commands");
	});

	test("includes env info when provided", () => {
		const prompt = buildSystemPrompt("staging");
		expect(prompt).toContain("Available environment for login: staging");
	});

	test("omits env line when not provided", () => {
		const prompt = buildSystemPrompt(undefined);
		expect(prompt).not.toContain("Available environment for login");
	});

	test("includes JSON output instruction", () => {
		const prompt = buildSystemPrompt(undefined);
		expect(prompt).toContain("JSON array of command strings");
	});

	test("prohibits quit, wipe, record commands", () => {
		const prompt = buildSystemPrompt(undefined);
		expect(prompt).toContain(
			'Do NOT include "quit", "wipe", or "record" commands',
		);
	});
});

describe("buildUserPrompt", () => {
	test("includes current URL", () => {
		const prompt = buildUserPrompt("https://example.com", "click login");
		expect(prompt).toContain("Current page: https://example.com");
	});

	test("includes instruction", () => {
		const prompt = buildUserPrompt(
			"https://example.com",
			"fill the search box",
		);
		expect(prompt).toContain("Instruction: fill the search box");
	});
});

describe("parseCommandList", () => {
	test("parses valid JSON array", () => {
		const result = parseCommandList(
			'["goto https://example.com", "snapshot", "click @e1"]',
		);
		expect(result).toEqual([
			"goto https://example.com",
			"snapshot",
			"click @e1",
		]);
	});

	test("extracts JSON array from surrounding text", () => {
		const result = parseCommandList(
			'Here are the commands:\n["goto https://example.com"]\nDone.',
		);
		expect(result).toEqual(["goto https://example.com"]);
	});

	test("returns null for non-JSON text", () => {
		expect(parseCommandList("just some text")).toBeNull();
	});

	test("returns null for invalid JSON", () => {
		expect(parseCommandList("[not valid json}")).toBeNull();
	});

	test("returns null for non-array JSON", () => {
		expect(parseCommandList('{"key": "value"}')).toBeNull();
	});

	test("handles empty array", () => {
		const result = parseCommandList("[]");
		expect(result).toEqual([]);
	});
});

describe("capCommands", () => {
	test("returns commands unchanged when under limit", () => {
		const cmds = ["goto https://example.com", "snapshot"];
		expect(capCommands(cmds)).toEqual(cmds);
	});

	test("caps at 20 commands", () => {
		const cmds = Array.from({ length: 25 }, (_, i) => `command ${i}`);
		const capped = capCommands(cmds);
		expect(capped).toHaveLength(20);
		expect(capped[0]).toBe("command 0");
		expect(capped[19]).toBe("command 19");
	});

	test("returns exactly 20 when at the limit", () => {
		const cmds = Array.from({ length: 20 }, (_, i) => `command ${i}`);
		expect(capCommands(cmds)).toHaveLength(20);
	});
});

describe("formatDryRun", () => {
	test("formats commands with numbered list", () => {
		const result = formatDryRun([
			"goto https://example.com",
			"snapshot",
			"click @e1",
		]);
		expect(result).toContain("Planned commands:");
		expect(result).toContain("1. browse goto https://example.com");
		expect(result).toContain("2. browse snapshot");
		expect(result).toContain("3. browse click @e1");
	});
});

describe("formatPlan", () => {
	test("formats plan with count and execution instruction", () => {
		const result = formatPlan(["goto https://example.com", "snapshot"]);
		expect(result).toContain("Planned 2 commands:");
		expect(result).toContain("1. browse goto https://example.com");
		expect(result).toContain("2. browse snapshot");
		expect(result).toContain(
			"Execute these commands sequentially to complete the task.",
		);
	});
});
