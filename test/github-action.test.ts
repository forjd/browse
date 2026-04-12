import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("github action", () => {
	test("defines composite action with required command input", () => {
		const yaml = readFileSync(".github/actions/browse/action.yml", "utf8");
		expect(yaml).toContain('using: "composite"');
		expect(yaml).toContain("command:");
		expect(yaml).toContain("Run Browse");
	});
});
