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
		expect(parsed[0].elements).toHaveLength(1);
		// Consumers treat `uri` as a path, so it must not carry the raw flow
		// name's spaces or slashes.
		expect(parsed[0].uri).toBe(`${parsed[0].id}.feature`);
		expect(parsed[0].uri).toMatch(/^[a-z0-9-]+\.feature$/);

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

	test("carries the keys strict cucumber consumers expect", () => {
		const parsed = JSON.parse(formatFlowCucumberJson("smoke", RESULTS, 600));
		// Genuine `cucumber-js --format json` always emits these, empty or not.
		expect(parsed[0].tags).toEqual([]);
		expect(parsed[0].elements[0].tags).toEqual([]);
		for (const step of parsed[0].elements[0].steps) {
			expect(step.arguments).toEqual([]);
			expect(step.match.location).toBe(`${parsed[0].uri}:${step.line}`);
		}
	});

	test("attaches screenshot paths as step embeddings", () => {
		// The other reporters surface `screenshotPath`; the one aimed at
		// dashboards must not be the only place the evidence disappears.
		const parsed = JSON.parse(
			formatFlowCucumberJson(
				"shots",
				[
					{
						stepNum: 1,
						description: "screenshot",
						passed: true,
						screenshotPath: "shots/step-1.png",
					},
					{ stepNum: 2, description: "goto", passed: true },
				],
				200,
			),
		);
		const steps = parsed[0].elements[0].steps;
		expect(steps[0].embeddings).toEqual([
			{
				mime_type: "text/plain",
				data: Buffer.from("shots/step-1.png").toString("base64"),
			},
		]);
		expect(steps[1].embeddings).toBeUndefined();
	});

	test("gives differently-named flows different cucumber ids", () => {
		const ids = [
			"Login flow",
			"login-flow",
			"Login  Flow!",
			"登录",
			"テスト",
			"!!!",
		].map((name) => JSON.parse(formatFlowCucumberJson(name, RESULTS, 600))[0]);

		// A plain slug collapses all six onto `login-flow` or `flow`, which makes
		// aggregated reports merge or overwrite unrelated scenarios.
		expect(new Set(ids.map((feature) => feature.id)).size).toBe(6);
		expect(new Set(ids.map((feature) => feature.elements[0].id)).size).toBe(6);
		// A name that already is its own slug keeps the readable id.
		expect(ids[1].id).toBe("login-flow");
		// A name with no ASCII alphanumerics still gets a usable id.
		expect(ids[3].id).toMatch(/^flow-[0-9a-f]{8}$/);
	});

	test("keeps cucumber ids stable across runs", () => {
		expect(
			JSON.parse(formatFlowCucumberJson("Login flow", RESULTS, 600))[0].id,
		).toBe(JSON.parse(formatFlowCucumberJson("Login flow", [], 0))[0].id);
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
