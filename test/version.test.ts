import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli.ts";
import { COMMANDS } from "../src/help.ts";
import { formatVersion } from "../src/version.ts";

describe("formatVersion", () => {
	test("includes version from package.json", async () => {
		const pkg = await import("../package.json");
		const output = formatVersion();
		expect(output).toContain(`browse ${pkg.default.version}`);
	});

	test("includes platform and architecture", () => {
		const output = formatVersion();
		// Format: browse X.Y.Z (os-arch)
		expect(output).toMatch(/\(.+-.+\)$/);
	});

	test("matches expected format exactly", () => {
		const output = formatVersion();
		expect(output).toMatch(/^browse \d+\.\d+\.\d+ \(\w+-\w+\)$/);
	});
});

describe("version in CLI", () => {
	test("parseArgs handles 'version' command", () => {
		const result = parseArgs(["version"]);
		expect(result).toEqual({ cmd: "version", args: [], timeout: undefined });
	});

	test("parseArgs handles '--version' flag", () => {
		const result = parseArgs(["--version"]);
		expect(result).toEqual({
			cmd: "--version",
			args: [],
			timeout: undefined,
		});
	});
});

describe("version in help", () => {
	test("version command is listed in COMMANDS", () => {
		expect(COMMANDS).toHaveProperty("version");
	});

	test("version help has summary and usage", () => {
		expect(COMMANDS.version.summary.length).toBeGreaterThan(0);
		expect(COMMANDS.version.usage.length).toBeGreaterThan(0);
	});
});
