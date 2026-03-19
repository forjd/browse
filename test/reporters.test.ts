import { describe, expect, test } from "bun:test";
import type { StepResult } from "../src/flow-runner.ts";
import {
	formatFlowJson,
	formatFlowMarkdown,
	formatHealthcheckJson,
	formatHealthcheckMarkdown,
	type HealthcheckPageResult,
} from "../src/reporters.ts";

// --- Fixtures ---

const PASSING_FLOW_RESULTS: StepResult[] = [
	{ stepNum: 1, description: "goto https://example.com", passed: true },
	{ stepNum: 2, description: "fill Email", passed: true },
	{
		stepNum: 3,
		description: "click Submit",
		passed: true,
		screenshotPath: "/tmp/shot.png",
	},
];

const FAILING_FLOW_RESULTS: StepResult[] = [
	{ stepNum: 1, description: "goto https://example.com", passed: true },
	{
		stepNum: 2,
		description: "click Submit",
		passed: false,
		error: "Element not found: 'Submit'",
	},
];

const EMPTY_FLOW_RESULTS: StepResult[] = [];

const PASSING_HC_RESULTS: HealthcheckPageResult[] = [
	{
		name: "Dashboard",
		url: "https://example.com/dashboard",
		passed: true,
		assertionResults: [{ label: 'visible ".dashboard"', passed: true }],
		consoleErrors: [],
		consoleWarnings: [],
	},
	{
		name: "Settings",
		url: "https://example.com/settings",
		passed: true,
		assertionResults: [],
		consoleErrors: [],
		consoleWarnings: [{ text: "Deprecation warning" }],
	},
];

const FAILING_HC_RESULTS: HealthcheckPageResult[] = [
	{
		name: "Dashboard",
		url: "https://example.com/dashboard",
		passed: false,
		error: "Navigation failed: net::ERR_CONNECTION_REFUSED",
		assertionResults: [],
		consoleErrors: [{ text: "Uncaught TypeError" }],
		consoleWarnings: [],
	},
	{
		name: "Settings",
		url: "https://example.com/settings",
		passed: true,
		assertionResults: [{ label: 'visible ".settings-form"', passed: true }],
		consoleErrors: [],
		consoleWarnings: [],
	},
];

// --- JSON Reporter: Flow ---

describe("formatFlowJson", () => {
	test("produces valid JSON", () => {
		const output = formatFlowJson("signup", PASSING_FLOW_RESULTS, 1500);
		expect(() => JSON.parse(output)).not.toThrow();
	});

	test("includes summary with correct counts for passing flow", () => {
		const parsed = JSON.parse(
			formatFlowJson("signup", PASSING_FLOW_RESULTS, 1500),
		);
		expect(parsed.name).toBe("signup");
		expect(parsed.status).toBe("passed");
		expect(parsed.summary.total).toBe(3);
		expect(parsed.summary.passed).toBe(3);
		expect(parsed.summary.failed).toBe(0);
		expect(parsed.duration_ms).toBe(1500);
	});

	test("includes step details", () => {
		const parsed = JSON.parse(
			formatFlowJson("signup", PASSING_FLOW_RESULTS, 1500),
		);
		expect(parsed.steps).toHaveLength(3);
		expect(parsed.steps[0].step).toBe(1);
		expect(parsed.steps[0].description).toBe("goto https://example.com");
		expect(parsed.steps[0].passed).toBe(true);
		expect(parsed.steps[2].screenshot).toBe("/tmp/shot.png");
	});

	test("marks failed flows and includes error details", () => {
		const parsed = JSON.parse(
			formatFlowJson("login", FAILING_FLOW_RESULTS, 800),
		);
		expect(parsed.status).toBe("failed");
		expect(parsed.summary.failed).toBe(1);
		expect(parsed.steps[1].passed).toBe(false);
		expect(parsed.steps[1].error).toContain("Element not found");
	});

	test("handles empty results", () => {
		const parsed = JSON.parse(formatFlowJson("empty", EMPTY_FLOW_RESULTS, 0));
		expect(parsed.status).toBe("passed");
		expect(parsed.summary.total).toBe(0);
		expect(parsed.steps).toHaveLength(0);
	});

	test("includes timestamp", () => {
		const parsed = JSON.parse(
			formatFlowJson("signup", PASSING_FLOW_RESULTS, 1500),
		);
		expect(parsed.timestamp).toBeDefined();
		expect(typeof parsed.timestamp).toBe("string");
		// ISO 8601 format check
		expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
	});
});

// --- JSON Reporter: Healthcheck ---

describe("formatHealthcheckJson", () => {
	test("produces valid JSON", () => {
		const output = formatHealthcheckJson(PASSING_HC_RESULTS, 2000);
		expect(() => JSON.parse(output)).not.toThrow();
	});

	test("includes summary with correct counts for passing healthcheck", () => {
		const parsed = JSON.parse(formatHealthcheckJson(PASSING_HC_RESULTS, 2000));
		expect(parsed.status).toBe("passed");
		expect(parsed.summary.total).toBe(2);
		expect(parsed.summary.passed).toBe(2);
		expect(parsed.summary.failed).toBe(0);
		expect(parsed.duration_ms).toBe(2000);
	});

	test("includes page details", () => {
		const parsed = JSON.parse(formatHealthcheckJson(PASSING_HC_RESULTS, 2000));
		expect(parsed.pages).toHaveLength(2);
		expect(parsed.pages[0].name).toBe("Dashboard");
		expect(parsed.pages[0].url).toBe("https://example.com/dashboard");
		expect(parsed.pages[0].passed).toBe(true);
	});

	test("includes assertions and console entries", () => {
		const parsed = JSON.parse(formatHealthcheckJson(PASSING_HC_RESULTS, 2000));
		expect(parsed.pages[0].assertions).toHaveLength(1);
		expect(parsed.pages[0].assertions[0].passed).toBe(true);
		expect(parsed.pages[1].console_warnings).toHaveLength(1);
		expect(parsed.pages[1].console_warnings[0]).toBe("Deprecation warning");
	});

	test("marks failed healthchecks and includes errors", () => {
		const parsed = JSON.parse(formatHealthcheckJson(FAILING_HC_RESULTS, 1200));
		expect(parsed.status).toBe("failed");
		expect(parsed.summary.failed).toBe(1);
		expect(parsed.pages[0].passed).toBe(false);
		expect(parsed.pages[0].error).toContain("Navigation failed");
		expect(parsed.pages[0].console_errors).toHaveLength(1);
	});

	test("includes timestamp", () => {
		const parsed = JSON.parse(formatHealthcheckJson(PASSING_HC_RESULTS, 2000));
		expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
	});
});

// --- Markdown Reporter: Flow ---

describe("formatFlowMarkdown", () => {
	test("includes flow name in heading", () => {
		const md = formatFlowMarkdown("signup", PASSING_FLOW_RESULTS, 1500);
		expect(md).toContain("# Flow: signup");
	});

	test("includes summary line with passed and failed counts", () => {
		const md = formatFlowMarkdown("signup", PASSING_FLOW_RESULTS, 1500);
		expect(md).toContain("3 passed");
		expect(md).toContain("0 failed");
		expect(md).toContain("3 total");
		expect(md).toContain("1.50s");
	});

	test("shows failed count in summary for failing flow", () => {
		const md = formatFlowMarkdown("login", FAILING_FLOW_RESULTS, 800);
		expect(md).toContain("1 passed");
		expect(md).toContain("1 failed");
		expect(md).toContain("2 total");
	});

	test("lists each step with pass/fail indicator", () => {
		const md = formatFlowMarkdown("login", FAILING_FLOW_RESULTS, 800);
		expect(md).toMatch(/✓.*goto/);
		expect(md).toMatch(/✗.*click Submit/);
	});

	test("includes error details for failed steps", () => {
		const md = formatFlowMarkdown("login", FAILING_FLOW_RESULTS, 800);
		expect(md).toContain("Element not found");
	});

	test("includes screenshot paths", () => {
		const md = formatFlowMarkdown("signup", PASSING_FLOW_RESULTS, 1500);
		expect(md).toContain("/tmp/shot.png");
	});

	test("handles empty results", () => {
		const md = formatFlowMarkdown("empty", EMPTY_FLOW_RESULTS, 0);
		expect(md).toContain("# Flow: empty");
		expect(md).toContain("0 passed");
		expect(md).toContain("0 failed");
		expect(md).toContain("0 total");
	});
});

// --- Markdown Reporter: Healthcheck ---

describe("formatHealthcheckMarkdown", () => {
	test("includes heading", () => {
		const md = formatHealthcheckMarkdown(PASSING_HC_RESULTS, 2000);
		expect(md).toContain("# Healthcheck");
	});

	test("includes summary line with passed and failed counts", () => {
		const md = formatHealthcheckMarkdown(PASSING_HC_RESULTS, 2000);
		expect(md).toContain("2 passed");
		expect(md).toContain("0 failed");
		expect(md).toContain("2 total");
		expect(md).toContain("2.00s");
	});

	test("shows failed count in summary for failing healthcheck", () => {
		const md = formatHealthcheckMarkdown(FAILING_HC_RESULTS, 1200);
		expect(md).toContain("1 passed");
		expect(md).toContain("1 failed");
		expect(md).toContain("2 total");
	});

	test("lists each page with pass/fail indicator", () => {
		const md = formatHealthcheckMarkdown(FAILING_HC_RESULTS, 1200);
		expect(md).toMatch(/✗.*Dashboard/);
		expect(md).toMatch(/✓.*Settings/);
	});

	test("includes error details for failed pages", () => {
		const md = formatHealthcheckMarkdown(FAILING_HC_RESULTS, 1200);
		expect(md).toContain("Navigation failed");
	});

	test("includes console warnings", () => {
		const md = formatHealthcheckMarkdown(PASSING_HC_RESULTS, 2000);
		expect(md).toContain("Deprecation warning");
	});

	test("includes assertion results", () => {
		const md = formatHealthcheckMarkdown(FAILING_HC_RESULTS, 1200);
		expect(md).toContain('visible ".settings-form"');
	});
});
