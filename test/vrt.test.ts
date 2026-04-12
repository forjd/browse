import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { handleVrt } from "../src/commands/vrt.ts";

const TEST_VRT_DIR = ".browse/vrt";

// We can't easily mock the Page object for baseline/check, so we test
// the subcommands that don't require a real browser: init, update, list.

function cleanup() {
	if (existsSync(".browse")) {
		rmSync(".browse", { recursive: true, force: true });
	}
}

describe("vrt", () => {
	beforeEach(() => {
		cleanup();
	});

	afterEach(() => {
		cleanup();
	});

	test("no args returns usage error", async () => {
		const result = await handleVrt(null as any, []);
		expect(result.ok).toBe(false);
		expect((result as any).error).toContain("Usage: browse vrt");
	});

	test("unknown subcommand returns error", async () => {
		const result = await handleVrt(null as any, ["unknown"]);
		expect(result.ok).toBe(false);
		expect((result as any).error).toContain(
			'Unknown vrt subcommand: "unknown"',
		);
	});

	describe("init", () => {
		test("creates directory structure and config", async () => {
			const result = await handleVrt(null as any, ["init"]);
			expect(result.ok).toBe(true);
			expect((result as any).data).toContain("VRT initialized");

			expect(existsSync(join(TEST_VRT_DIR, "baselines"))).toBe(true);
			expect(existsSync(join(TEST_VRT_DIR, "current"))).toBe(true);
			expect(existsSync(join(TEST_VRT_DIR, "diffs"))).toBe(true);
			expect(existsSync(join(TEST_VRT_DIR, "config.json"))).toBe(true);
		});

		test("config contains default values", async () => {
			await handleVrt(null as any, ["init"]);
			const config = JSON.parse(
				readFileSync(join(TEST_VRT_DIR, "config.json"), "utf-8"),
			);
			expect(config.threshold).toBe(5);
			expect(config.viewports).toHaveLength(2);
			expect(config.viewports[0].name).toBe("mobile");
			expect(config.viewports[1].name).toBe("desktop");
			expect(config.pages).toEqual([]);
		});

		test("does not overwrite existing config", async () => {
			mkdirSync(TEST_VRT_DIR, { recursive: true });
			const customConfig = { threshold: 10, viewports: [], pages: [] };
			writeFileSync(
				join(TEST_VRT_DIR, "config.json"),
				JSON.stringify(customConfig),
			);

			await handleVrt(null as any, ["init"]);

			const config = JSON.parse(
				readFileSync(join(TEST_VRT_DIR, "config.json"), "utf-8"),
			);
			expect(config.threshold).toBe(10);
		});
	});

	describe("list", () => {
		test("returns message when no baselines dir", async () => {
			const result = await handleVrt(null as any, ["list"]);
			expect(result.ok).toBe(true);
			expect((result as any).data).toContain("No baselines directory found");
		});

		test("returns message when baselines dir is empty", async () => {
			mkdirSync(join(TEST_VRT_DIR, "baselines"), { recursive: true });
			const result = await handleVrt(null as any, ["list"]);
			expect(result.ok).toBe(true);
			expect((result as any).data).toContain("No baseline screenshots found");
		});

		test("lists baseline files with sizes", async () => {
			const baselinesDir = join(TEST_VRT_DIR, "baselines");
			mkdirSync(baselinesDir, { recursive: true });
			// Write a small fake PNG file
			writeFileSync(join(baselinesDir, "home-desktop.png"), Buffer.alloc(1024));
			writeFileSync(join(baselinesDir, "home-mobile.png"), Buffer.alloc(2048));

			const result = await handleVrt(null as any, ["list"]);
			expect(result.ok).toBe(true);
			const data = (result as any).data as string;
			expect(data).toContain("2 baseline(s)");
			expect(data).toContain("home-desktop.png");
			expect(data).toContain("home-mobile.png");
			expect(data).toContain("KB");
		});
	});

	describe("update", () => {
		test("returns error when no current dir", async () => {
			const result = await handleVrt(null as any, ["update", "--all"]);
			expect(result.ok).toBe(false);
			expect((result as any).error).toContain("No current screenshots found");
		});

		test("returns error when no flags given", async () => {
			mkdirSync(join(TEST_VRT_DIR, "current"), { recursive: true });
			writeFileSync(
				join(TEST_VRT_DIR, "current", "test.png"),
				Buffer.alloc(100),
			);
			const result = await handleVrt(null as any, ["update"]);
			expect(result.ok).toBe(false);
			expect((result as any).error).toContain("Specify --all");
		});

		test("--all copies all current to baselines", async () => {
			const currentDir = join(TEST_VRT_DIR, "current");
			const baselinesDir = join(TEST_VRT_DIR, "baselines");
			mkdirSync(currentDir, { recursive: true });
			mkdirSync(baselinesDir, { recursive: true });

			writeFileSync(join(currentDir, "page-desktop.png"), Buffer.from("new1"));
			writeFileSync(join(currentDir, "page-mobile.png"), Buffer.from("new2"));

			const result = await handleVrt(null as any, ["update", "--all"]);
			expect(result.ok).toBe(true);
			expect((result as any).data).toContain("Updated 2 baseline(s)");
			expect(existsSync(join(baselinesDir, "page-desktop.png"))).toBe(true);
			expect(existsSync(join(baselinesDir, "page-mobile.png"))).toBe(true);
			expect(
				readFileSync(join(baselinesDir, "page-desktop.png"), "utf-8"),
			).toBe("new1");
		});

		test("--only copies specific files", async () => {
			const currentDir = join(TEST_VRT_DIR, "current");
			const baselinesDir = join(TEST_VRT_DIR, "baselines");
			mkdirSync(currentDir, { recursive: true });
			mkdirSync(baselinesDir, { recursive: true });

			writeFileSync(join(currentDir, "page-desktop.png"), Buffer.from("d"));
			writeFileSync(join(currentDir, "page-mobile.png"), Buffer.from("m"));

			const result = await handleVrt(null as any, [
				"update",
				"--only",
				"page-desktop",
			]);
			expect(result.ok).toBe(true);
			expect((result as any).data).toContain("Updated 1 baseline(s)");
			expect(existsSync(join(baselinesDir, "page-desktop.png"))).toBe(true);
			expect(existsSync(join(baselinesDir, "page-mobile.png"))).toBe(false);
		});

		test("--only with no matches returns error", async () => {
			const currentDir = join(TEST_VRT_DIR, "current");
			mkdirSync(currentDir, { recursive: true });
			writeFileSync(join(currentDir, "page-desktop.png"), Buffer.from("d"));

			const result = await handleVrt(null as any, [
				"update",
				"--only",
				"nonexistent",
			]);
			expect(result.ok).toBe(false);
			expect((result as any).error).toContain("No matching screenshots");
		});
	});

	describe("baseline", () => {
		test("returns error when no pages configured", async () => {
			await handleVrt(null as any, ["init"]);
			// baseline without --url and empty config.pages should fail
			const result = await handleVrt(null as any, ["baseline"]);
			expect(result.ok).toBe(false);
			expect((result as any).error).toContain("No pages configured");
		});
	});
});
