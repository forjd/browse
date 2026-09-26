import { describe, expect, test } from "bun:test";
import type { StepResult } from "../src/flow-runner.ts";
import {
	formatFlowAllureJson,
	formatFlowCucumberJson,
	formatFlowHtml,
	formatFlowReporter,
	formatFlowTap,
} from "../src/reporters.ts";

const RESULTS: StepResult[] = [
	{ stepNum: 1, description: "goto", passed: true },
	{ stepNum: 2, description: "submit", passed: false, error: "boom" },
];

describe("additional reporters", () => {
	test("formats TAP output", () => {
		const tap = formatFlowTap("smoke", RESULTS);
		expect(tap).toContain("TAP version 13");
		expect(tap).toContain("1..2");
		expect(tap).toContain("not ok 2 - Step 2: submit");
	});

	test("numbers TAP assertions sequentially even when step numbers repeat", () => {
		const tap = formatFlowTap("matrix", [
			{ stepNum: 1, description: "[admin] goto", passed: true },
			{ stepNum: 1, description: "[viewer] goto", passed: true },
		]);
		expect(tap).toContain("ok 1 - Step 1: [admin] goto");
		expect(tap).toContain("ok 2 - Step 1: [viewer] goto");
	});

	test("formats allure-compatible json", () => {
		const parsed = JSON.parse(formatFlowAllureJson("smoke", RESULTS, 600));
		expect(parsed.name).toBe("smoke");
		expect(parsed.status).toBe("failed");
		expect(parsed.steps).toHaveLength(2);
	});

	test("formats cucumber json with one feature and one scenario", () => {
		const parsed = JSON.parse(
			formatFlowCucumberJson("login smoke", RESULTS, 600),
		);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].keyword).toBe("Feature");
		expect(parsed[0].name).toBe("login smoke");
		expect(parsed[0].id).toBe("login-smoke");
		expect(parsed[0].uri).toBe("login smoke.feature");
		expect(parsed[0].elements).toHaveLength(1);

		const steps = parsed[0].elements[0].steps;
		expect(steps).toHaveLength(2);
		expect(steps[0]).toMatchObject({
			keyword: "Given ",
			name: "goto",
			result: { status: "passed", duration: 300_000_000 },
		});
		expect(steps[1]).toMatchObject({
			keyword: "Then ",
			name: "submit",
			result: { status: "failed", error_message: "boom" },
		});
	});

	test("emits cucumber json for a flow with no steps", () => {
		const parsed = JSON.parse(formatFlowCucumberJson("empty", [], 0));
		expect(parsed[0].elements[0].steps).toEqual([]);
	});

	test("dispatches the cucumber reporter by name", () => {
		expect(formatFlowReporter("smoke", RESULTS, 600, "cucumber")).toBe(
			formatFlowCucumberJson("smoke", RESULTS, 600),
		);
	});

	test("formats searchable html output", () => {
		const html = formatFlowHtml("smoke", RESULTS, 600);
		expect(html).toContain('data-step="2"');
		expect(html).toContain('<input id="flow-search"');
		expect(html).toContain('addEventListener("input"');
	});
});
