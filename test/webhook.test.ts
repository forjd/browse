import { afterEach, describe, expect, mock, test } from "bun:test";
import { handleFlow } from "../src/commands/flow.ts";
import { parseHealthcheckArgs } from "../src/commands/healthcheck.ts";
import type { BrowseConfig } from "../src/config.ts";
import type { StepResult } from "../src/flow-runner.ts";
import {
	formatFlowWebhookPayload,
	formatHealthcheckWebhookPayload,
	parseWebhookFlag,
	sendWebhook,
} from "../src/webhook.ts";

describe("parseWebhookFlag", () => {
	test("extracts URL from --webhook flag", () => {
		const result = parseWebhookFlag([
			"--webhook",
			"https://hooks.slack.com/test",
		]);
		expect(result.url).toBe("https://hooks.slack.com/test");
		expect(result.error).toBeUndefined();
	});

	test("returns undefined when --webhook is absent", () => {
		const result = parseWebhookFlag(["--reporter", "junit"]);
		expect(result.url).toBeUndefined();
		expect(result.error).toBeUndefined();
	});

	test("returns error when --webhook has no value", () => {
		const result = parseWebhookFlag(["--webhook"]);
		expect(result.url).toBeUndefined();
		expect(result.error).toContain("Missing value for --webhook");
	});

	test("returns error when --webhook value starts with --", () => {
		const result = parseWebhookFlag(["--webhook", "--reporter"]);
		expect(result.url).toBeUndefined();
		expect(result.error).toContain("Missing value for --webhook");
	});

	test("works alongside other flags", () => {
		const result = parseWebhookFlag([
			"--reporter",
			"junit",
			"--webhook",
			"https://example.com/hook",
			"--continue-on-error",
		]);
		expect(result.url).toBe("https://example.com/hook");
		expect(result.error).toBeUndefined();
	});
});

describe("formatFlowWebhookPayload", () => {
	test("formats a passing flow payload", () => {
		const results: StepResult[] = [
			{ stepNum: 1, description: "goto https://example.com", passed: true },
			{
				stepNum: 2,
				description: 'assert textContains "Welcome"',
				passed: true,
			},
		];
		const payload = formatFlowWebhookPayload("smoke-test", results, 1234);

		expect(payload.type).toBe("flow");
		expect(payload.name).toBe("smoke-test");
		expect(payload.status).toBe("passed");
		expect(payload.summary.total).toBe(2);
		expect(payload.summary.passed).toBe(2);
		expect(payload.summary.failed).toBe(0);
		expect(payload.duration_ms).toBe(1234);
		expect(payload.failures).toEqual([]);
		expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	test("formats a failing flow payload with failure details", () => {
		const results: StepResult[] = [
			{ stepNum: 1, description: "goto https://example.com", passed: true },
			{
				stepNum: 2,
				description: 'assert textContains "Dashboard"',
				passed: false,
				error: "Text not found: Dashboard",
			},
			{ stepNum: 3, description: "screenshot", passed: true },
		];
		const payload = formatFlowWebhookPayload("login-flow", results, 5678);

		expect(payload.status).toBe("failed");
		expect(payload.summary.total).toBe(3);
		expect(payload.summary.passed).toBe(2);
		expect(payload.summary.failed).toBe(1);
		expect(payload.failures).toHaveLength(1);
		expect(payload.failures[0].step).toBe(2);
		expect(payload.failures[0].error).toBe("Text not found: Dashboard");
	});
});

describe("formatHealthcheckWebhookPayload", () => {
	test("formats a passing healthcheck payload", () => {
		const results = [
			{
				name: "Homepage",
				url: "https://example.com",
				passed: true,
				consoleErrors: [],
				consoleWarnings: [],
				assertionResults: [],
			},
			{
				name: "API Health",
				url: "https://example.com/api/health",
				passed: true,
				consoleErrors: [],
				consoleWarnings: [],
				assertionResults: [],
			},
		];
		const payload = formatHealthcheckWebhookPayload(results, 2000);

		expect(payload.type).toBe("healthcheck");
		expect(payload.status).toBe("passed");
		expect(payload.summary.total).toBe(2);
		expect(payload.summary.passed).toBe(2);
		expect(payload.summary.failed).toBe(0);
		expect(payload.duration_ms).toBe(2000);
		expect(payload.failures).toEqual([]);
		expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	test("formats a failing healthcheck payload with failure details", () => {
		const results = [
			{
				name: "Dashboard",
				url: "https://example.com/dashboard",
				passed: false,
				error: "Navigation failed: net::ERR_CONNECTION_REFUSED",
				consoleErrors: [],
				consoleWarnings: [],
				assertionResults: [],
			},
			{
				name: "Settings",
				url: "https://example.com/settings",
				passed: false,
				consoleErrors: [],
				consoleWarnings: [],
				assertionResults: [
					{
						label: 'visible ".settings-form"',
						passed: false,
						reason: "Element not visible",
					},
				],
			},
		];
		const payload = formatHealthcheckWebhookPayload(results, 3000);

		expect(payload.status).toBe("failed");
		expect(payload.summary.total).toBe(2);
		expect(payload.summary.passed).toBe(0);
		expect(payload.summary.failed).toBe(2);
		expect(payload.failures).toHaveLength(2);
		expect(payload.failures[0].page).toBe("Dashboard");
		expect(payload.failures[0].error).toBe(
			"Navigation failed: net::ERR_CONNECTION_REFUSED",
		);
		expect(payload.failures[1].page).toBe("Settings");
		expect(payload.failures[1].error).toContain("Element not visible");
	});
});

describe("sendWebhook", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("POSTs JSON payload to the given URL", async () => {
		const fetchMock = mock(() =>
			Promise.resolve(new Response("OK", { status: 200 })),
		);
		globalThis.fetch = fetchMock;

		const payload = { type: "flow", name: "test", status: "passed" };
		await sendWebhook("https://hooks.example.com/test", payload);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://hooks.example.com/test");
		expect(init.method).toBe("POST");
		expect(init.headers["Content-Type"]).toBe("application/json");
		expect(JSON.parse(init.body)).toEqual(payload);
	});

	test("includes custom headers when provided", async () => {
		const fetchMock = mock(() =>
			Promise.resolve(new Response("OK", { status: 200 })),
		);
		globalThis.fetch = fetchMock;

		const payload = { type: "flow", name: "test", status: "passed" };
		await sendWebhook("https://hooks.example.com/test", payload, {
			Authorization: "Bearer secret",
		});

		const [, init] = fetchMock.mock.calls[0];
		expect(init.headers.Authorization).toBe("Bearer secret");
		expect(init.headers["Content-Type"]).toBe("application/json");
	});

	test("does not throw on fetch failure", async () => {
		globalThis.fetch = mock(() => Promise.reject(new Error("Network error")));

		const payload = { type: "flow", name: "test", status: "passed" };
		// Should not throw
		await sendWebhook("https://hooks.example.com/test", payload);
	});

	test("does not throw on non-2xx response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("Server Error", { status: 500 })),
		);

		const payload = { type: "flow", name: "test", status: "passed" };
		// Should not throw
		await sendWebhook("https://hooks.example.com/test", payload);
	});
});

// --- Integration tests: --webhook flag in commands ---

const BASE_CONFIG: BrowseConfig = {
	environments: {
		staging: {
			loginUrl: "https://example.com/login",
			userEnvVar: "U",
			passEnvVar: "P",
			successCondition: { urlContains: "/dashboard" },
		},
	},
	flows: {
		simple: {
			description: "A simple flow",
			steps: [{ goto: "https://example.com" }],
		},
	},
};

describe("handleFlow --webhook validation", () => {
	test("returns error when --webhook has no value", async () => {
		const result = await handleFlow(BASE_CONFIG, null as any, [
			"simple",
			"--webhook",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Missing value for --webhook");
		}
	});
});

describe("parseHealthcheckArgs --webhook", () => {
	test("parses --webhook URL", () => {
		const result = parseHealthcheckArgs([
			"--webhook",
			"https://hooks.example.com/test",
		]);
		expect(result.webhookUrl).toBe("https://hooks.example.com/test");
		expect(result.error).toBeUndefined();
	});

	test("returns error when --webhook has no value", () => {
		const result = parseHealthcheckArgs(["--webhook"]);
		expect(result.error).toContain("Missing value for --webhook");
	});
});
