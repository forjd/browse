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
	options?: { suiteProperties?: Record<string, string> },
): string {
	const failures = results.filter((r) => !r.passed).length;
	const tests = results.length;
	const durationSec = (durationMs / 1000).toFixed(3);

	const lines: string[] = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		`<testsuites>`,
		`  <testsuite name="${escapeXml(flowName)}" tests="${tests}" failures="${failures}" time="${durationSec}">`,
	];

	if (
		options?.suiteProperties &&
		Object.keys(options.suiteProperties).length > 0
	) {
		lines.push("    <properties>");
		for (const [key, value] of Object.entries(options.suiteProperties)) {
			lines.push(
				`      <property name="${escapeXml(key)}" value="${escapeXml(value)}"/>`,
			);
		}
		lines.push("    </properties>");
	}

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
	consoleWarnings: { text: string }[];
};

// --- JSON reporters ---

/**
 * Format flow results as structured JSON.
 */
export function formatFlowJson(
	flowName: string,
	results: StepResult[],
	durationMs: number,
): string {
	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;

	return JSON.stringify({
		name: flowName,
		status: failed > 0 ? "failed" : "passed",
		summary: { total: results.length, passed, failed },
		duration_ms: durationMs,
		steps: results.map((r) => ({
			step: r.stepNum,
			description: r.description,
			passed: r.passed,
			...(r.error ? { error: r.error } : {}),
			...(r.screenshotPath ? { screenshot: r.screenshotPath } : {}),
		})),
		timestamp: new Date().toISOString(),
	});
}

/**
 * Format healthcheck results as structured JSON.
 */
export function formatHealthcheckJson(
	results: HealthcheckPageResult[],
	durationMs: number,
): string {
	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;

	return JSON.stringify({
		status: failed > 0 ? "failed" : "passed",
		summary: { total: results.length, passed, failed },
		duration_ms: durationMs,
		pages: results.map((r) => ({
			name: r.name,
			url: r.url,
			passed: r.passed,
			...(r.error ? { error: r.error } : {}),
			assertions: r.assertionResults.map((a) => ({
				label: a.label,
				passed: a.passed,
				...(a.reason ? { reason: a.reason } : {}),
			})),
			console_errors: r.consoleErrors.map((e) => e.text),
			console_warnings: r.consoleWarnings.map((e) => e.text),
		})),
		timestamp: new Date().toISOString(),
	});
}

// --- Markdown reporters ---

/**
 * Format flow results as Markdown.
 */
export function formatFlowMarkdown(
	flowName: string,
	results: StepResult[],
	durationMs: number,
): string {
	const passed = results.filter((r) => r.passed).length;
	const failed = results.length - passed;
	const durationSec = (durationMs / 1000).toFixed(2);
	const lines: string[] = [];

	lines.push(`# Flow: ${flowName}`);
	lines.push("");
	lines.push(
		`**${passed} passed / ${failed} failed (${results.length} total)** in ${durationSec}s`,
	);
	lines.push("");

	if (results.length > 0) {
		lines.push("## Steps");
		lines.push("");
		for (const r of results) {
			const mark = r.passed ? "✓" : "✗";
			lines.push(`- ${mark} **Step ${r.stepNum}:** ${r.description}`);
			if (r.error) {
				lines.push(`  - Error: ${r.error}`);
			}
			if (r.screenshotPath) {
				lines.push(`  - Screenshot: ${r.screenshotPath}`);
			}
		}
	}

	return lines.join("\n");
}

/**
 * Format healthcheck results as Markdown.
 */
export function formatHealthcheckMarkdown(
	results: HealthcheckPageResult[],
	durationMs: number,
): string {
	const passed = results.filter((r) => r.passed).length;
	const failed = results.length - passed;
	const durationSec = (durationMs / 1000).toFixed(2);
	const lines: string[] = [];

	lines.push("# Healthcheck");
	lines.push("");
	lines.push(
		`**${passed} passed / ${failed} failed (${results.length} total)** in ${durationSec}s`,
	);
	lines.push("");

	if (results.length > 0) {
		lines.push("## Pages");
		lines.push("");
		for (const r of results) {
			const mark = r.passed ? "✓" : "✗";
			lines.push(`### ${mark} ${r.name}`);
			lines.push("");
			lines.push(`URL: ${r.url}`);
			if (r.error) {
				lines.push(`\nError: ${r.error}`);
			}
			if (r.assertionResults.length > 0) {
				lines.push("\nAssertions:");
				for (const a of r.assertionResults) {
					const aMark = a.passed ? "✓" : "✗";
					const reason = a.reason ? ` — ${a.reason}` : "";
					lines.push(`- ${aMark} ${a.label}${reason}`);
				}
			}
			if (r.consoleErrors.length > 0) {
				lines.push("\nConsole errors:");
				for (const e of r.consoleErrors) {
					lines.push(`- ${e.text}`);
				}
			}
			if (r.consoleWarnings.length > 0) {
				lines.push("\nConsole warnings:");
				for (const e of r.consoleWarnings) {
					lines.push(`- ${e.text}`);
				}
			}
			lines.push("");
		}
	}

	return lines.join("\n");
}

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
			if (result.consoleWarnings.length > 0) {
				failureMessages.push(
					`Console warnings: ${result.consoleWarnings.map((e) => e.text).join("; ")}`,
				);
			}
			const message = failureMessages.join("; ");
			lines.push(
				`      <failure message="${escapeXml(message)}">${escapeXml(message)}</failure>`,
			);
		}

		if (result.consoleWarnings.length > 0 && result.passed) {
			const warningText = result.consoleWarnings.map((e) => e.text).join("\n");
			lines.push(
				`      <system-out>${escapeXml(`Console warnings:\n${warningText}`)}</system-out>`,
			);
		}

		lines.push("    </testcase>");
	}

	lines.push("  </testsuite>");
	lines.push("</testsuites>");

	return lines.join("\n");
}

export function formatFlowTap(flowName: string, results: StepResult[]): string {
	const lines = [
		"TAP version 13",
		`# Flow: ${flowName}`,
		`1..${results.length}`,
	];
	for (const result of results) {
		const status = result.passed ? "ok" : "not ok";
		lines.push(
			`${status} ${result.stepNum} - Step ${result.stepNum}: ${result.description}`,
		);
		if (!result.passed && result.error) {
			lines.push(`  ---`);
			lines.push(`  message: "${result.error.replace(/"/g, '"')}"`);
			lines.push(`  ...`);
		}
	}
	return lines.join("\n");
}

export function formatFlowAllureJson(
	flowName: string,
	results: StepResult[],
	durationMs: number,
): string {
	const failed = results.some((result) => !result.passed);
	return JSON.stringify({
		name: flowName,
		status: failed ? "failed" : "passed",
		stage: "finished",
		duration: durationMs,
		steps: results.map((result) => ({
			name: `Step ${result.stepNum}: ${result.description}`,
			status: result.passed ? "passed" : "failed",
			...(result.error ? { statusDetails: { message: result.error } } : {}),
		})),
	});
}

export function formatFlowHtml(
	flowName: string,
	results: StepResult[],
	durationMs: number,
): string {
	const rows = results
		.map(
			(result) =>
				`<tr data-step="${result.stepNum}" data-status="${result.passed ? "passed" : "failed"}"><td>${result.stepNum}</td><td>${result.description}</td><td>${result.passed ? "passed" : "failed"}</td><td>${result.error ?? ""}</td></tr>`,
		)
		.join("");

	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Browse report: ${flowName}</title></head>
<body>
  <h1>Flow report: ${flowName}</h1>
  <p>Duration: ${durationMs}ms</p>
  <label for="flow-search">Filter</label>
  <input id="flow-search" placeholder="Search steps" />
  <table>
    <thead><tr><th>Step</th><th>Description</th><th>Status</th><th>Error</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

export function computeFlakySteps(
	history: Record<number, boolean[]>,
): number[] {
	const flaky: number[] = [];
	for (const [step, outcomes] of Object.entries(history)) {
		if (outcomes.length < 3) continue;
		const passRate = outcomes.filter(Boolean).length / outcomes.length;
		if (passRate >= 0.6 && passRate < 1) {
			flaky.push(Number(step));
		}
	}
	return flaky.sort((a, b) => a - b);
}
