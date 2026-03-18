import { describe, expect, test } from "bun:test";
import { COMMANDS, formatCommandHelp, formatOverview } from "../src/help.ts";

describe("COMMANDS registry", () => {
	test("every command has non-empty summary and usage", () => {
		for (const [, entry] of Object.entries(COMMANDS)) {
			expect(entry.summary.length).toBeGreaterThan(0);
			expect(entry.usage.length).toBeGreaterThan(0);
		}
	});

	test("includes all expected commands", () => {
		const expected = [
			"goto",
			"text",
			"snapshot",
			"click",
			"fill",
			"select",
			"screenshot",
			"console",
			"network",
			"auth-state",
			"login",
			"tab",
			"flow",
			"assert",
			"healthcheck",
			"wipe",
			"benchmark",
			"viewport",
			"quit",
			"help",
		];
		for (const cmd of expected) {
			expect(COMMANDS).toHaveProperty(cmd);
		}
	});
});

describe("formatOverview", () => {
	test("includes Usage header", () => {
		const overview = formatOverview();
		expect(overview).toContain("Usage: browse <command>");
	});

	test("includes every command name", () => {
		const overview = formatOverview();
		for (const cmd of Object.keys(COMMANDS)) {
			expect(overview).toContain(cmd);
		}
	});

	test("includes summaries", () => {
		const overview = formatOverview();
		for (const entry of Object.values(COMMANDS)) {
			expect(overview).toContain(entry.summary);
		}
	});
});

describe("formatCommandHelp", () => {
	test("returns detailed usage for a known command", () => {
		const help = formatCommandHelp("goto");
		expect(help).not.toBeNull();
		expect(help).toContain("goto");
	});

	test("returns null for an unknown command", () => {
		expect(formatCommandHelp("nonexistent")).toBeNull();
	});

	test("includes the command summary", () => {
		const help = formatCommandHelp("screenshot");
		expect(help).toContain(COMMANDS.screenshot.summary);
	});

	test("includes the command usage block", () => {
		const help = formatCommandHelp("tab");
		expect(help).toContain(COMMANDS.tab.usage);
	});

	test("returns help text for the help command itself", () => {
		const help = formatCommandHelp("help");
		expect(help).not.toBeNull();
		expect(help).toContain("help");
	});
});
