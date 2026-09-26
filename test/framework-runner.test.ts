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
				"Usage: browse framework init <vitest|jest|cucumber> [--dir <path>] [--force]",
		});
	});

	test("returns usage for an unknown runner", async () => {
		const result = await handleFrameworkCommand(["init", "mocha"], {
			cwd: TEST_DIR,
		});
		expect(result).toEqual({
			ok: false,
			error:
				"Usage: browse framework init <vitest|jest|cucumber> [--dir <path>] [--force]",
		});
	});
});

describe("framework runner — cucumber", () => {
	test("builds cucumber command", () => {
		expect(buildFrameworkCommand("cucumber", "features/login.feature")).toEqual(
			["cucumber-js", "features/login.feature"],
		);
	});

	test("scaffolds a feature, step definitions, harness, and config", async () => {
		const result = await handleFrameworkCommand(["init", "cucumber"], {
			cwd: TEST_DIR,
		});

		expect(result.ok).toBe(true);
		for (const relativePath of [
			join("tests", "browse-harness.cjs"),
			join("tests", "features", "browse.feature"),
			join("tests", "step-definitions", "browse.steps.cjs"),
			join("tests", "cucumber.cjs"),
		]) {
			expect(existsSync(join(TEST_DIR, relativePath))).toBe(true);
		}

		const feature = readFileSync(
			join(TEST_DIR, "tests", "features", "browse.feature"),
			"utf-8",
		);
		expect(feature).toContain("Feature: Browse smoke test");
		expect(feature).toContain('When I open "https://example.com"');

		const steps = readFileSync(
			join(TEST_DIR, "tests", "step-definitions", "browse.steps.cjs"),
			"utf-8",
		);
		expect(steps).toContain('require("@cucumber/cucumber")');
		// Steps sit one level below the harness.
		expect(steps).toContain('require("../browse-harness.cjs")');
		expect(steps).toContain('When("I open {string}", async function (url) {');

		// cucumber-js only expands a bare directory to `.js`, so the generated
		// config must glob the `.cjs` step files explicitly.
		const config = readFileSync(
			join(TEST_DIR, "tests", "cucumber.cjs"),
			"utf-8",
		);
		expect(config).toContain(
			`require: [${JSON.stringify(join("tests", "step-definitions", "*.cjs"))}]`,
		);
		expect(config).toContain(
			`paths: [${JSON.stringify(join("tests", "features"))}]`,
		);

		if (result.ok) {
			expect(result.data).toContain(
				"npm install --save-dev @cucumber/cucumber",
			);
			expect(result.data).toContain(
				`cucumber-js --config ${join("tests", "cucumber.cjs")}`,
			);
			expect(result.data).toContain("--profile failing");
		}
	});

	test("honours --dir and refuses to overwrite without --force", async () => {
		const first = await handleFrameworkCommand(
			["init", "cucumber", "--dir", "bdd"],
			{ cwd: TEST_DIR },
		);
		expect(first.ok).toBe(true);
		expect(
			existsSync(join(TEST_DIR, "bdd", "features", "browse.feature")),
		).toBe(true);

		const second = await handleFrameworkCommand(
			["init", "cucumber", "--dir", "bdd"],
			{ cwd: TEST_DIR },
		);
		expect(second).toEqual({
			ok: false,
			error: `${join("bdd", "browse-harness.cjs")} already exists. Use --force to overwrite generated files.`,
		});

		const forced = await handleFrameworkCommand(
			["init", "cucumber", "--dir", "bdd", "--force"],
			{ cwd: TEST_DIR },
		);
		expect(forced.ok).toBe(true);
	});
});
