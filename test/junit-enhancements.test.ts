import { describe, expect, test } from "bun:test";
import type { StepResult } from "../src/flow-runner.ts";
import {
	computeFlakySteps,
	formatFlowJUnit,
	formatHealthcheckJUnit,
	type HealthcheckPageResult,
} from "../src/reporters.ts";

const RESULTS: StepResult[] = [
	{ stepNum: 1, description: "goto", passed: true },
	{ stepNum: 2, description: "submit", passed: false, error: "boom" },
];

const HEALTHCHECK_RESULTS: HealthcheckPageResult[] = [
	{
		name: "Dashboard",
		url: "https://example.com/dashboard",
		passed: true,
		assertionResults: [],
		consoleErrors: [],
		consoleWarnings: [],
	},
];

describe("junit enhancements", () => {
	test("adds testsuite properties metadata", () => {
		const xml = formatFlowJUnit("smoke", RESULTS, 500, {
			suiteProperties: { environment: "ci", browser: "chrome" },
		});
		expect(xml).toContain('<property name="environment" value="ci"/>');
		expect(xml).toContain('<property name="browser" value="chrome"/>');
	});

	test("adds testsuite properties metadata for healthchecks", () => {
		const xml = formatHealthcheckJUnit(HEALTHCHECK_RESULTS, 500, {
			suiteProperties: { environment: "staging", region: "eu-west-1" },
		});
		expect(xml).toContain('<property name="environment" value="staging"/>');
		expect(xml).toContain('<property name="region" value="eu-west-1"/>');
	});

	test("flags flaky steps based on historical pass rate", () => {
		const flaky = computeFlakySteps({
			1: [true, true, false],
			2: [false, false],
		});
		expect(flaky).toContain(1);
		expect(flaky).not.toContain(2);
	});
});
