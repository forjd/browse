import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	buildFrameworkCommand,
	type FrameworkRunner,
	handleFrameworkCommand,
} from "../src/framework-runner.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-framework-runner");

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("framework runner", () => {
	test("builds vitest command", () => {
		const cmd = buildFrameworkCommand("vitest", "tests/smoke.spec.ts");
		expect(cmd).toEqual(["vitest", "run", "tests/smoke.spec.ts"]);
	});

	test("builds jest command with default target", () => {
		const cmd = buildFrameworkCommand("jest");
		expect(cmd).toEqual(["jest", "--runInBand"]);
	});

	test("rejects unsupported framework", () => {
		expect(() => buildFrameworkCommand("mocha" as FrameworkRunner)).toThrow(
			"Unsupported framework",
		);
	});

	test("scaffolds a Vitest starter in the requested directory", async () => {
		const result = await handleFrameworkCommand(
			["init", "vitest", "--dir", "qa"],
			{ cwd: TEST_DIR },
		);

		expect(result.ok).toBe(true);
		expect(existsSync(join(TEST_DIR, "qa", "browse-harness.cjs"))).toBe(true);
		expect(existsSync(join(TEST_DIR, "qa", "browse.vitest.test.cjs"))).toBe(
			true,
		);

		const harness = readFileSync(
			join(TEST_DIR, "qa", "browse-harness.cjs"),
			"utf-8",
		);
		expect(harness).toContain("createBrowseHarness");
		expect(harness).toContain("process.env.BROWSE_BIN");

		const testFile = readFileSync(
			join(TEST_DIR, "qa", "browse.vitest.test.cjs"),
			"utf-8",
		);
		expect(testFile).toContain('require("vitest")');
		expect(testFile).toContain('browse.run(["goto", "https://example.com"])');
		if (result.ok) {
			expect(result.data).toContain("vitest run qa/browse.vitest.test.cjs");
		}
	});

	test("scaffolds a Jest starter with global test helpers", async () => {
		const result = await handleFrameworkCommand(["init", "jest"], {
			cwd: TEST_DIR,
		});

		expect(result.ok).toBe(true);
		const testFile = readFileSync(
			join(TEST_DIR, "tests", "browse.jest.test.cjs"),
			"utf-8",
		);
		expect(testFile).not.toContain('require("jest")');
		expect(testFile).toContain("beforeAll(async () => {");
		if (result.ok) {
			expect(result.data).toContain(
				"jest --runInBand tests/browse.jest.test.cjs",
			);
		}
	});

	test("refuses to overwrite generated files without --force", async () => {
		await handleFrameworkCommand(["init", "vitest"], { cwd: TEST_DIR });

		const result = await handleFrameworkCommand(["init", "vitest"], {
			cwd: TEST_DIR,
		});

		expect(result).toEqual({
			ok: false,
			error:
				"tests/browse-harness.cjs already exists. Use --force to overwrite generated files.",
		});
	});

	test("returns usage for unsupported subcommands", async () => {
		const result = await handleFrameworkCommand(["list"], { cwd: TEST_DIR });
		expect(result).toEqual({
			ok: false,
			error:
				"Usage: browse framework init <vitest|jest> [--dir <path>] [--force]",
		});
	});
});
