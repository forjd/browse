import { describe, expect, test } from "bun:test";
import {
	buildFrameworkCommand,
	type FrameworkRunner,
} from "../src/framework-runner.ts";

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
});
