import { describe, expect, test } from "bun:test";
import type { StepResult } from "../src/flow-runner.ts";
import {
	formatFlowAllureJson,
	formatFlowHtml,
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

	test("formats allure-compatible json", () => {
		const parsed = JSON.parse(formatFlowAllureJson("smoke", RESULTS, 600));
		expect(parsed.name).toBe("smoke");
		expect(parsed.status).toBe("failed");
		expect(parsed.steps).toHaveLength(2);
	});

	test("formats searchable html output", () => {
		const html = formatFlowHtml("smoke", RESULTS, 600);
		expect(html).toContain('data-step="2"');
		expect(html).toContain('<input id="flow-search"');
	});
});
