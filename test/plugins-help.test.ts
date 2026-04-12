import { describe, expect, test } from "bun:test";
import { COMMANDS, formatCommandHelp } from "../src/help.ts";

describe("plugins help", () => {
	test("lists the plugins command in built-in help", () => {
		expect(COMMANDS).toHaveProperty("plugins");
	});

	test("documents official and search subcommands", () => {
		const help = formatCommandHelp("plugins");
		expect(help).not.toBeNull();
		expect(help).toContain("official");
		expect(help).toContain("search");
		expect(help).toContain("--page");
		expect(help).toContain("--limit");
	});
});
