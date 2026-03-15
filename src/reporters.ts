import type { StepResult } from "./flow-runner.ts";

/**
 * Escape XML special characters.
 */
function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * Format flow results as JUnit XML.
 */
export function formatFlowJUnit(
	flowName: string,
	results: StepResult[],
	durationMs: number,
): string {
	const failures = results.filter((r) => !r.passed).length;
	const tests = results.length;
	const durationSec = (durationMs / 1000).toFixed(3);

	const lines: string[] = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		`<testsuites>`,
		`  <testsuite name="${escapeXml(flowName)}" tests="${tests}" failures="${failures}" time="${durationSec}">`,
	];

	for (const result of results) {
		const testName = `Step ${result.stepNum}: ${escapeXml(result.description)}`;
		lines.push(
			`    <testcase name="${testName}" classname="${escapeXml(flowName)}">`,
		);
		if (!result.passed && result.error) {
			lines.push(
				`      <failure message="${escapeXml(result.error)}">${escapeXml(result.error)}</failure>`,
			);
		}
		if (result.screenshotPath) {
			lines.push(
				`      <system-out>${escapeXml(result.screenshotPath)}</system-out>`,
			);
		}
		lines.push("    </testcase>");
	}

	lines.push("  </testsuite>");
	lines.push("</testsuites>");

	return lines.join("\n");
}

export type HealthcheckPageResult = {
	name: string;
	url: string;
	passed: boolean;
	error?: string;
	assertionResults: { label: string; passed: boolean; reason?: string }[];
	consoleErrors: { text: string }[];
};

/**
 * Format healthcheck results as JUnit XML.
 */
export function formatHealthcheckJUnit(
	results: HealthcheckPageResult[],
	durationMs: number,
): string {
	const failures = results.filter((r) => !r.passed).length;
	const tests = results.length;
	const durationSec = (durationMs / 1000).toFixed(3);

	const lines: string[] = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		`<testsuites>`,
		`  <testsuite name="healthcheck" tests="${tests}" failures="${failures}" time="${durationSec}">`,
	];

	for (const result of results) {
		const testName = escapeXml(result.name);
		lines.push(`    <testcase name="${testName}" classname="healthcheck">`);

		if (!result.passed) {
			const failureMessages: string[] = [];
			if (result.error) {
				failureMessages.push(result.error);
			}
			for (const ar of result.assertionResults) {
				if (!ar.passed && ar.reason) {
					failureMessages.push(`${ar.label}: ${ar.reason}`);
				}
			}
			if (result.consoleErrors.length > 0) {
				failureMessages.push(
					`Console errors: ${result.consoleErrors.map((e) => e.text).join("; ")}`,
				);
			}
			const message = failureMessages.join("; ");
			lines.push(
				`      <failure message="${escapeXml(message)}">${escapeXml(message)}</failure>`,
			);
		}

		lines.push("    </testcase>");
	}

	lines.push("  </testsuite>");
	lines.push("</testsuites>");

	return lines.join("\n");
}
