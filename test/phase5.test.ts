import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

describe("Phase 5 — Skill File and Integration", () => {
	describe("SKILL.md", () => {
		const skillPath = resolve(ROOT, "SKILL.md");

		test("exists", () => {
			expect(existsSync(skillPath)).toBe(true);
		});

		const content = () => readFileSync(skillPath, "utf-8");

		test("has overview section", () => {
			expect(content()).toContain("## Overview");
		});

		test("has quick start section", () => {
			expect(content()).toContain("## Quick start");
		});

		test("has command reference section", () => {
			expect(content()).toContain("## Command reference");
		});

		test("has ref system section", () => {
			expect(content()).toMatch(/## The ref system|## Ref system/);
		});

		test("has QA methodology section", () => {
			expect(content()).toContain("## QA methodology");
		});

		test("has authentication section", () => {
			expect(content()).toContain("## Authentication");
		});

		test("has failure patterns section", () => {
			expect(content()).toMatch(
				/## Common failure patterns|## Failure patterns/,
			);
		});

		test("has configuration section", () => {
			expect(content()).toContain("## Configuration");
		});

		// Command completeness — every command from Phases 0–4
		describe("documents all commands", () => {
			const commands = [
				"browse goto",
				"browse text",
				"browse quit",
				"browse snapshot",
				"browse click",
				"browse fill",
				"browse select",
				"browse screenshot",
				"browse console",
				"browse network",
				"browse auth-state save",
				"browse auth-state load",
				"browse login",
				"browse tab list",
				"browse tab new",
				"browse tab switch",
				"browse tab close",
				"browse flow list",
				"browse flow",
				"browse assert",
				"browse healthcheck",
			];

			for (const cmd of commands) {
				test(`documents '${cmd}'`, () => {
					expect(content()).toContain(cmd);
				});
			}
		});

		// Key flags
		describe("documents key flags", () => {
			const flags = [
				"--viewport",
				"--selector",
				"--level",
				"--keep",
				"--all",
				"--env",
				"--var",
				"-i",
				"-f",
			];

			for (const flag of flags) {
				test(`documents '${flag}'`, () => {
					expect(content()).toContain(flag);
				});
			}
		});

		test("explains ref format (@eN)", () => {
			expect(content()).toMatch(/@e\d/);
		});

		test("explains stale refs", () => {
			expect(content()).toMatch(/stale/i);
		});

		test("mentions browse.config.json", () => {
			expect(content()).toContain("browse.config.json");
		});
	});

	describe("setup.sh", () => {
		const setupPath = resolve(ROOT, "setup.sh");

		test("exists", () => {
			expect(existsSync(setupPath)).toBe(true);
		});

		test("is executable", () => {
			const stat = statSync(setupPath);
			const executableBits = 0o111;
			expect(stat.mode & executableBits).toBeGreaterThan(0);
		});

		const content = () => readFileSync(setupPath, "utf-8");

		test("has shebang", () => {
			expect(content()).toMatch(/^#!\/.*sh/);
		});

		test("checks for bun", () => {
			expect(content()).toMatch(/command.*bun|which.*bun|type.*bun/);
		});

		test("runs bun install", () => {
			expect(content()).toContain("bun install");
		});

		test("installs Playwright chromium", () => {
			expect(content()).toMatch(/playwright install.*chromium/);
		});

		test("compiles the binary", () => {
			expect(content()).toContain("bun build --compile");
		});

		test("creates symlink to ~/.local/bin/browse", () => {
			expect(content()).toContain(".local/bin/browse");
		});

		test("checks if ~/.local/bin is on PATH", () => {
			expect(content()).toMatch(/PATH.*\.local\/bin|\.local\/bin.*PATH/);
		});

		test("exits on error (set -e or explicit checks)", () => {
			expect(content()).toMatch(/set -e|exit 1/);
		});
	});

	describe("CLAUDE.md", () => {
		const claudePath = resolve(ROOT, "CLAUDE.md");

		test("exists", () => {
			expect(existsSync(claudePath)).toBe(true);
		});

		const content = () => readFileSync(claudePath, "utf-8");

		test("has browse tool section", () => {
			expect(content()).toMatch(/browse/i);
			expect(content()).toContain("SKILL.md");
		});

		test("mentions dist/browse binary", () => {
			expect(content()).toContain("dist/browse");
		});

		test("establishes preference over MCP browser tools", () => {
			expect(content()).toMatch(/prefer.*over.*MCP|prefer.*browse/i);
		});

		test("mentions setup.sh", () => {
			expect(content()).toContain("setup.sh");
		});
	});
});
