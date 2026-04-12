import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("github action", () => {
	const yaml = readFileSync(".github/actions/browse/action.yml", "utf8");

	test("defines composite action with required command input", () => {
		expect(yaml).toContain('using: "composite"');
		expect(yaml).toContain("command:");
		expect(yaml).toContain("Run Browse");
	});

	test("installs and runs browse from the action checkout", () => {
		expect(yaml).toContain("working-directory:");
		expect(yaml).toContain("github.action_path");
		expect(yaml).toContain("src/cli.ts");
	});

	test("caches Bun dependencies and Playwright browsers", () => {
		expect(yaml).toContain("actions/cache");
		expect(yaml).toContain("~/.bun/install/cache");
		expect(yaml).toContain("node_modules");
		expect(yaml).toContain("~/.cache/ms-playwright");
	});

	test("fails clearly on unsupported Windows runners", () => {
		expect(yaml).toContain("runner.os == 'Windows'");
		expect(yaml).toContain("supports Linux and macOS runners");
	});
});
