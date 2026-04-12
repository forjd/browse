import { describe, expect, test } from "bun:test";
import { CustomReporterRegistry } from "../src/custom-reporter.ts";

describe("custom reporter registry", () => {
	test("registers and retrieves a reporter", () => {
		const registry = new CustomReporterRegistry();
		registry.register({
			name: "teamcity",
			render: ({ flowName }) =>
				`##teamcity[testSuiteStarted name='${flowName}']`,
		});
		const reporter = registry.get("teamcity");
		expect(reporter).toBeDefined();
		expect(
			reporter?.render({ flowName: "smoke", results: [], durationMs: 0 }),
		).toContain("smoke");
	});

	test("rejects nameless reporters", () => {
		const registry = new CustomReporterRegistry();
		expect(() =>
			registry.register({
				name: "",
				render: () => "",
			}),
		).toThrow("Reporter name is required");
	});
});
