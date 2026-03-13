import { describe, expect, mock, test } from "bun:test";
import type { FlowConfig } from "../src/config.ts";
import {
	type FlowDeps,
	formatFlowReport,
	interpolateVars,
	parseVars,
	runFlow,
	type StepResult,
} from "../src/flow-runner.ts";

describe("parseVars", () => {
	test("parses single --var flag", () => {
		const result = parseVars(["--var", "base_url=https://example.com"]);
		expect(result).toEqual({ base_url: "https://example.com" });
	});

	test("parses multiple --var flags", () => {
		const result = parseVars([
			"--var",
			"base_url=https://example.com",
			"--var",
			"email=test@test.com",
			"--var",
			"pass=secret",
		]);
		expect(result).toEqual({
			base_url: "https://example.com",
			email: "test@test.com",
			pass: "secret",
		});
	});

	test("splits on first = only (value may contain =)", () => {
		const result = parseVars(["--var", "query=a=b&c=d"]);
		expect(result).toEqual({ query: "a=b&c=d" });
	});

	test("handles empty value", () => {
		const result = parseVars(["--var", "empty="]);
		expect(result).toEqual({ empty: "" });
	});

	test("returns empty object with no --var flags", () => {
		const result = parseVars(["some", "other", "args"]);
		expect(result).toEqual({});
	});

	test("ignores --var without a value", () => {
		const result = parseVars(["--var"]);
		expect(result).toEqual({});
	});

	test("ignores --var with missing = in value", () => {
		const result = parseVars(["--var", "noequals"]);
		expect(result).toEqual({});
	});
});

describe("interpolateVars", () => {
	test("replaces {{key}} with value", () => {
		const result = interpolateVars("{{base_url}}/register", {
			base_url: "https://example.com",
		});
		expect(result).toBe("https://example.com/register");
	});

	test("replaces multiple occurrences", () => {
		const result = interpolateVars("{{a}} and {{b}} and {{a}}", {
			a: "X",
			b: "Y",
		});
		expect(result).toBe("X and Y and X");
	});

	test("leaves unmatched variables as literal", () => {
		const result = interpolateVars("{{known}} and {{unknown}}", {
			known: "OK",
		});
		expect(result).toBe("OK and {{unknown}}");
	});

	test("handles no variables in template", () => {
		const result = interpolateVars("plain text", { key: "val" });
		expect(result).toBe("plain text");
	});

	test("handles empty vars", () => {
		const result = interpolateVars("{{key}}", {});
		expect(result).toBe("{{key}}");
	});
});

// --- Helpers for runFlow tests ---

// Creates a mock page object that satisfies all the real handler functions.
// Each handler interacts with the page differently; this mock covers them all.
function createMockPage(overrides: Record<string, unknown> = {}) {
	const mockLocatorInstance = {
		count: mock(() => Promise.resolve(1)),
		first: mock(() => ({
			click: mock(() => Promise.resolve()),
			fill: mock(() => Promise.resolve()),
			selectOption: mock(() => Promise.resolve()),
			isVisible: mock(() => Promise.resolve(true)),
			screenshot: mock(() => Promise.resolve(Buffer.from(""))),
			innerText: mock(() => Promise.resolve("mock text")),
		})),
		ariaSnapshot: mock(() => Promise.resolve('- button "OK"')),
	};

	return {
		goto: mock(() => Promise.resolve()),
		url: mock(() => "https://example.com/page"),
		title: mock(() => Promise.resolve("Mock Page")),
		innerText: mock(() => Promise.resolve("body text")),
		evaluate: mock(() => Promise.resolve(500)),
		screenshot: mock(() => Promise.resolve(Buffer.from(""))),
		setViewportSize: mock(() => Promise.resolve()),
		waitForURL: mock(() => Promise.resolve()),
		waitForSelector: mock(() => Promise.resolve()),
		getByRole: mock(() => ({
			count: mock(() => Promise.resolve(1)),
			first: mock(() => ({
				click: mock(() => Promise.resolve()),
				fill: mock(() => Promise.resolve()),
				selectOption: mock(() => Promise.resolve()),
				isVisible: mock(() => Promise.resolve(true)),
			})),
			fill: mock(() => Promise.resolve()),
			click: mock(() => Promise.resolve()),
		})),
		getByLabel: mock(() => ({
			count: mock(() => Promise.resolve(1)),
			first: mock(() => ({
				selectOption: mock(() => Promise.resolve()),
			})),
		})),
		locator: mock(() => mockLocatorInstance),
		...overrides,
	} as unknown as FlowDeps["page"];
}

function createMockBuffer() {
	return {
		push: mock(() => {}),
		drain: mock(() => []),
		peek: mock(() => []),
		clear: mock(() => {}),
	};
}

function createMockDeps(pageOverrides: Record<string, unknown> = {}): FlowDeps {
	return {
		page: createMockPage(pageOverrides),
		config: null,
		consoleBuffer: createMockBuffer() as unknown as FlowDeps["consoleBuffer"],
		networkBuffer: createMockBuffer() as unknown as FlowDeps["networkBuffer"],
	};
}

// --- stepDescription tests (exercised indirectly through runFlow) ---

describe("stepDescription (via runFlow)", () => {
	// stepDescription is private, but we can verify its output via the
	// description field in StepResult returned by runFlow.

	test("describes goto step", async () => {
		const flow: FlowConfig = { steps: [{ goto: "https://example.com" }] };
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe("goto https://example.com");
	});

	test("describes click step", async () => {
		const flow: FlowConfig = { steps: [{ click: "Submit" }] };
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe("click Submit");
	});

	test("describes fill step with field names", async () => {
		const flow: FlowConfig = {
			steps: [{ fill: { Email: "a@b.com", Password: "secret" } }],
		};
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe("fill Email, Password");
	});

	test("describes select step with field names", async () => {
		const flow: FlowConfig = {
			steps: [{ select: { Country: "UK" } }],
		};
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe("select Country");
	});

	test("describes screenshot step", async () => {
		const flow: FlowConfig = { steps: [{ screenshot: true }] };
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe("screenshot");
	});

	test("describes console step with level", async () => {
		const flow: FlowConfig = { steps: [{ console: "error" }] };
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe("console error");
	});

	test("describes network step", async () => {
		const flow: FlowConfig = { steps: [{ network: true }] };
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe("network");
	});

	test("describes wait urlContains", async () => {
		const flow: FlowConfig = {
			steps: [{ wait: { urlContains: "/dashboard" } }],
		};
		const deps = createMockDeps({
			url: mock(() => "https://example.com/dashboard"),
		});
		const { results } = await runFlow("test", flow, {}, deps, false);
		expect(results[0].description).toBe('wait urlContains "/dashboard"');
	});

	test("describes wait urlPattern", async () => {
		const flow: FlowConfig = {
			steps: [{ wait: { urlPattern: "/users/\\d+" } }],
		};
		const deps = createMockDeps({
			url: mock(() => "https://example.com/users/123"),
		});
		const { results } = await runFlow("test", flow, {}, deps, false);
		expect(results[0].description).toBe('wait urlPattern "/users/\\d+"');
	});

	test("describes wait elementVisible", async () => {
		const flow: FlowConfig = {
			steps: [{ wait: { elementVisible: "#main" } }],
		};
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe('wait elementVisible "#main"');
	});

	test("describes wait textVisible", async () => {
		const flow: FlowConfig = {
			steps: [{ wait: { textVisible: "Welcome" } }],
		};
		const deps = createMockDeps({
			innerText: mock(() => Promise.resolve("Welcome back")),
		});
		const { results } = await runFlow("test", flow, {}, deps, false);
		expect(results[0].description).toBe('wait textVisible "Welcome"');
	});

	test("describes wait timeout", async () => {
		const flow: FlowConfig = { steps: [{ wait: { timeout: 50 } }] };
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe("wait 50ms");
	});

	test("describes assert visible", async () => {
		const flow: FlowConfig = {
			steps: [{ assert: { visible: "#header" } }],
		};
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe('assert visible "#header"');
	});

	test("describes assert notVisible", async () => {
		const flow: FlowConfig = {
			steps: [{ assert: { notVisible: ".error" } }],
		};
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe('assert notVisible ".error"');
	});

	test("describes assert textContains", async () => {
		const flow: FlowConfig = {
			steps: [{ assert: { textContains: "Success" } }],
		};
		const deps = createMockDeps({
			innerText: mock(() => Promise.resolve("Operation Success")),
		});
		const { results } = await runFlow("test", flow, {}, deps, false);
		expect(results[0].description).toBe('assert textContains "Success"');
	});

	test("describes assert textNotContains", async () => {
		const flow: FlowConfig = {
			steps: [{ assert: { textNotContains: "Error" } }],
		};
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe('assert textNotContains "Error"');
	});

	test("describes assert urlContains", async () => {
		const flow: FlowConfig = {
			steps: [{ assert: { urlContains: "/home" } }],
		};
		const deps = createMockDeps({
			url: mock(() => "https://example.com/home"),
		});
		const { results } = await runFlow("test", flow, {}, deps, false);
		expect(results[0].description).toBe('assert urlContains "/home"');
	});

	test("describes assert urlPattern", async () => {
		const flow: FlowConfig = {
			steps: [{ assert: { urlPattern: "^https://" } }],
		};
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe('assert urlPattern "^https://"');
	});

	test("describes assert elementText", async () => {
		const flow: FlowConfig = {
			steps: [
				{ assert: { elementText: { selector: "h1", contains: "Welcome" } } },
			],
		};
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe('assert elementText "h1"');
	});

	test("describes assert elementCount", async () => {
		const flow: FlowConfig = {
			steps: [{ assert: { elementCount: { selector: "li.item", count: 5 } } }],
		};
		const locatorWithCount = {
			count: mock(() => Promise.resolve(5)),
			first: mock(() => ({
				isVisible: mock(() => Promise.resolve(true)),
				innerText: mock(() => Promise.resolve("item")),
			})),
		};
		const deps = createMockDeps({
			locator: mock(() => locatorWithCount),
		});
		const { results } = await runFlow("test", flow, {}, deps, false);
		expect(results[0].description).toBe('assert elementCount "li.item"');
	});

	test("describes login step", async () => {
		// login step will fail because config is null, but description is still set
		const flow: FlowConfig = { steps: [{ login: "staging" }] };
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe("login staging");
	});

	test("describes snapshot step", async () => {
		const flow: FlowConfig = { steps: [{ snapshot: true }] };
		const { results } = await runFlow(
			"test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].description).toBe("snapshot");
	});
});

// --- interpolateStep tests (exercised indirectly through runFlow) ---

describe("interpolateStep (via runFlow)", () => {
	test("interpolates variables in goto URL", async () => {
		const flow: FlowConfig = {
			steps: [{ goto: "{{base_url}}/login" }],
		};
		const vars = { base_url: "https://app.test" };
		const deps = createMockDeps();
		await runFlow("test", flow, vars, deps, false);
		// handleGoto receives the page and the interpolated URL
		expect(deps.page.goto).toHaveBeenCalledWith(
			"https://app.test/login",
			expect.any(Object),
		);
	});

	test("interpolates variables in click target", async () => {
		const flow: FlowConfig = {
			steps: [{ click: "{{button_name}}" }],
		};
		const vars = { button_name: "Sign In" };
		const { results } = await runFlow(
			"test",
			flow,
			vars,
			createMockDeps(),
			false,
		);
		expect(results[0].passed).toBe(true);
		// The description reflects the interpolated value
		expect(results[0].description).toBe("click Sign In");
	});

	test("interpolates variables in fill values", async () => {
		const flow: FlowConfig = {
			steps: [{ fill: { Email: "{{email}}", Password: "{{pass}}" } }],
		};
		const vars = { email: "user@test.com", pass: "s3cret" };
		const { results } = await runFlow(
			"test",
			flow,
			vars,
			createMockDeps(),
			false,
		);
		expect(results[0].passed).toBe(true);
		expect(results[0].description).toBe("fill Email, Password");
	});

	test("leaves unmatched variables intact in goto URL", async () => {
		const flow: FlowConfig = {
			steps: [{ goto: "{{unknown_var}}/path" }],
		};
		const deps = createMockDeps();
		await runFlow("test", flow, {}, deps, false);
		// The unresolved variable stays as literal in the URL
		expect(deps.page.goto).toHaveBeenCalledWith(
			"{{unknown_var}}/path",
			expect.any(Object),
		);
	});
});

// --- runFlow tests ---

describe("runFlow", () => {
	test("runs a simple goto step successfully", async () => {
		const flow: FlowConfig = {
			steps: [{ goto: "https://example.com" }],
		};
		const { results, screenshots } = await runFlow(
			"simple",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results).toHaveLength(1);
		expect(results[0].passed).toBe(true);
		expect(results[0].stepNum).toBe(1);
		expect(screenshots).toHaveLength(0);
	});

	test("runs multiple steps in sequence", async () => {
		const flow: FlowConfig = {
			steps: [
				{ goto: "https://example.com" },
				{ click: "Login" },
				{ fill: { Username: "admin" } },
			],
		};
		const { results } = await runFlow(
			"multi",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results).toHaveLength(3);
		expect(results.every((r) => r.passed)).toBe(true);
		expect(results[0].stepNum).toBe(1);
		expect(results[1].stepNum).toBe(2);
		expect(results[2].stepNum).toBe(3);
	});

	test("stops on first error when continueOnError is false", async () => {
		// Use click steps because findAndClickByName throws when the element
		// is not found, unlike handleGoto which catches errors internally.
		const getByRoleFail = mock(() => ({
			count: mock(() => Promise.resolve(0)),
			first: mock(() => ({
				click: mock(() => Promise.reject(new Error("not found"))),
			})),
		}));
		const deps = createMockDeps({ getByRole: getByRoleFail });
		const flow: FlowConfig = {
			steps: [
				{ goto: "https://example.com" },
				{ click: "Missing Button" },
				{ click: "Never Reached" },
			],
		};
		const { results } = await runFlow("stop", flow, {}, deps, false);
		expect(results).toHaveLength(2);
		expect(results[0].passed).toBe(true);
		expect(results[1].passed).toBe(false);
		expect(results[1].error).toContain("Missing Button");
	});

	test("continues past errors when continueOnError is true", async () => {
		const getByRoleFail = mock(() => ({
			count: mock(() => Promise.resolve(0)),
			first: mock(() => ({
				click: mock(() => Promise.reject(new Error("not found"))),
			})),
		}));
		const deps = createMockDeps({ getByRole: getByRoleFail });
		const flow: FlowConfig = {
			steps: [
				{ goto: "https://example.com" },
				{ click: "Missing Button" },
				{ goto: "https://third.example.com" },
			],
		};
		const { results } = await runFlow("continue", flow, {}, deps, true);
		expect(results).toHaveLength(3);
		expect(results[0].passed).toBe(true);
		expect(results[1].passed).toBe(false);
		expect(results[1].error).toContain("Missing Button");
		expect(results[2].passed).toBe(true);
	});

	test("handles screenshot step and records path", async () => {
		const flow: FlowConfig = {
			steps: [{ screenshot: true }],
		};
		const { results, screenshots } = await runFlow(
			"screenshot-test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results).toHaveLength(1);
		expect(results[0].passed).toBe(true);
		expect(results[0].screenshotPath).toBeDefined();
		expect(screenshots).toHaveLength(1);
		expect(screenshots[0]).toContain("flow-screenshot-test-step1-");
	});

	test("handles screenshot step with custom path", async () => {
		const flow: FlowConfig = {
			steps: [{ screenshot: "/tmp/browse-test-custom-screenshot.png" }],
		};
		const { results, screenshots } = await runFlow(
			"custom-path",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].passed).toBe(true);
		expect(results[0].screenshotPath).toBe(
			"/tmp/browse-test-custom-screenshot.png",
		);
		expect(screenshots).toEqual(["/tmp/browse-test-custom-screenshot.png"]);
	});

	test("records error when screenshot fails", async () => {
		const deps = createMockDeps({
			evaluate: mock(() => Promise.reject(new Error("Page crashed"))),
			screenshot: mock(() => Promise.reject(new Error("Page crashed"))),
		});
		const flow: FlowConfig = {
			steps: [{ screenshot: true }],
		};
		const { results } = await runFlow("screenshot-fail", flow, {}, deps, false);
		expect(results[0].passed).toBe(false);
		expect(results[0].error).toBeDefined();
	});

	test("handles console step", async () => {
		const flow: FlowConfig = {
			steps: [{ console: "error" }],
		};
		const deps = createMockDeps();
		const { results } = await runFlow("console-test", flow, {}, deps, false);
		expect(results[0].passed).toBe(true);
		expect(results[0].description).toBe("console error");
	});

	test("handles network step", async () => {
		const flow: FlowConfig = {
			steps: [{ network: true }],
		};
		const deps = createMockDeps();
		const { results } = await runFlow("network-test", flow, {}, deps, false);
		expect(results[0].passed).toBe(true);
		expect(results[0].description).toBe("network");
	});

	test("handles assert visible step that passes", async () => {
		const flow: FlowConfig = {
			steps: [{ assert: { visible: "#main" } }],
		};
		const { results } = await runFlow(
			"assert-pass",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].passed).toBe(true);
	});

	test("handles assert visible step that fails", async () => {
		const locatorNotVisible = {
			count: mock(() => Promise.resolve(0)),
			first: mock(() => ({
				isVisible: mock(() => Promise.resolve(false)),
				innerText: mock(() => Promise.resolve("")),
			})),
		};
		const deps = createMockDeps({
			locator: mock(() => locatorNotVisible),
		});
		const flow: FlowConfig = {
			steps: [{ assert: { visible: "#missing" } }],
		};
		const { results } = await runFlow("assert-fail", flow, {}, deps, false);
		expect(results[0].passed).toBe(false);
		expect(results[0].error).toBeDefined();
	});

	test("handles assert urlContains that passes", async () => {
		const deps = createMockDeps({
			url: mock(() => "https://example.com/dashboard"),
		});
		const flow: FlowConfig = {
			steps: [{ assert: { urlContains: "/dashboard" } }],
		};
		const { results } = await runFlow("url-assert", flow, {}, deps, false);
		expect(results[0].passed).toBe(true);
	});

	test("handles assert urlContains that fails", async () => {
		const deps = createMockDeps({
			url: mock(() => "https://example.com/login"),
		});
		const flow: FlowConfig = {
			steps: [{ assert: { urlContains: "/dashboard" } }],
		};
		const { results } = await runFlow("url-fail", flow, {}, deps, false);
		expect(results[0].passed).toBe(false);
		expect(results[0].error).toContain("/dashboard");
	});

	test("handles assert textContains that passes", async () => {
		const deps = createMockDeps({
			innerText: mock(() => Promise.resolve("Welcome to the Dashboard")),
		});
		const flow: FlowConfig = {
			steps: [{ assert: { textContains: "Welcome" } }],
		};
		const { results } = await runFlow("text-assert", flow, {}, deps, false);
		expect(results[0].passed).toBe(true);
	});

	test("handles assert textContains that fails", async () => {
		const deps = createMockDeps({
			innerText: mock(() => Promise.resolve("Login page")),
		});
		const flow: FlowConfig = {
			steps: [{ assert: { textContains: "Welcome" } }],
		};
		const { results } = await runFlow("text-fail", flow, {}, deps, false);
		expect(results[0].passed).toBe(false);
		expect(results[0].error).toContain("Welcome");
	});

	test("handles login step (fails gracefully when config is null)", async () => {
		const flow: FlowConfig = {
			steps: [{ login: "production" }],
		};
		const deps = createMockDeps();
		const { results } = await runFlow("login-test", flow, {}, deps, false);
		// Login fails because deps.config is null
		expect(results[0].passed).toBe(false);
		expect(results[0].error).toContain("browse.config.json");
	});

	test("handles snapshot step", async () => {
		const flow: FlowConfig = {
			steps: [{ snapshot: true }],
		};
		const { results } = await runFlow(
			"snapshot-test",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].passed).toBe(true);
		expect(results[0].description).toBe("snapshot");
	});

	test("handles wait timeout step", async () => {
		const flow: FlowConfig = {
			steps: [{ wait: { timeout: 10 } }],
		};
		const { results } = await runFlow(
			"wait-timeout",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].passed).toBe(true);
		expect(results[0].description).toBe("wait 10ms");
	});

	test("handles wait urlContains that succeeds immediately", async () => {
		const deps = createMockDeps({
			url: mock(() => "https://example.com/dashboard"),
		});
		const flow: FlowConfig = {
			steps: [{ wait: { urlContains: "/dashboard" } }],
		};
		const { results } = await runFlow("wait-url", flow, {}, deps, false);
		expect(results[0].passed).toBe(true);
	});

	test("handles wait elementVisible that succeeds", async () => {
		const flow: FlowConfig = {
			steps: [{ wait: { elementVisible: ".loaded" } }],
		};
		const { results } = await runFlow(
			"wait-elem",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results[0].passed).toBe(true);
	});

	test("handles wait textVisible that succeeds", async () => {
		const deps = createMockDeps({
			innerText: mock(() => Promise.resolve("Content loaded")),
		});
		const flow: FlowConfig = {
			steps: [{ wait: { textVisible: "Content" } }],
		};
		const { results } = await runFlow("wait-text", flow, {}, deps, false);
		expect(results[0].passed).toBe(true);
	});

	test("captures error message from failing steps", async () => {
		// When findAndClickByName exhausts all roles, it throws with a
		// descriptive message that runFlow captures in the result.
		const deps = createMockDeps({
			getByRole: mock(() => ({
				count: mock(() => Promise.resolve(0)),
				first: mock(() => ({
					click: mock(() => Promise.reject(new Error("timeout"))),
				})),
			})),
		});
		const flow: FlowConfig = {
			steps: [{ click: "Something" }],
		};
		const { results } = await runFlow("err-msg", flow, {}, deps, false);
		expect(results[0].passed).toBe(false);
		expect(results[0].error).toContain("Something");
	});

	test("returns empty results for a flow with no steps", async () => {
		const flow: FlowConfig = { steps: [] };
		const { results, screenshots } = await runFlow(
			"empty",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results).toHaveLength(0);
		expect(screenshots).toHaveLength(0);
	});

	test("assigns sequential step numbers starting from 1", async () => {
		const flow: FlowConfig = {
			steps: [
				{ goto: "https://a.com" },
				{ goto: "https://b.com" },
				{ goto: "https://c.com" },
			],
		};
		const { results } = await runFlow(
			"step-nums",
			flow,
			{},
			createMockDeps(),
			false,
		);
		expect(results.map((r) => r.stepNum)).toEqual([1, 2, 3]);
	});

	test("click step fails when element is not found", async () => {
		// getByRole returns count 0 for all roles so findAndClickByName throws
		const deps = createMockDeps({
			getByRole: mock(() => ({
				count: mock(() => Promise.resolve(0)),
				first: mock(() => ({
					click: mock(() => Promise.reject(new Error("not found"))),
				})),
			})),
		});
		const flow: FlowConfig = {
			steps: [{ click: "Nonexistent" }],
		};
		const { results } = await runFlow("click-fail", flow, {}, deps, false);
		expect(results[0].passed).toBe(false);
		expect(results[0].error).toContain("Nonexistent");
	});

	test("fill step fails when element is not found", async () => {
		const deps = createMockDeps({
			getByRole: mock(() => ({
				count: mock(() => Promise.resolve(0)),
				first: mock(() => ({
					fill: mock(() => Promise.reject(new Error("not found"))),
				})),
			})),
		});
		const flow: FlowConfig = {
			steps: [{ fill: { Email: "test@example.com" } }],
		};
		const { results } = await runFlow("fill-fail", flow, {}, deps, false);
		expect(results[0].passed).toBe(false);
		expect(results[0].error).toContain("Email");
	});

	test("select step fails when element is not found", async () => {
		const deps = createMockDeps({
			getByRole: mock(() => ({
				count: mock(() => Promise.resolve(0)),
				first: mock(() => ({
					selectOption: mock(() => Promise.reject(new Error("not found"))),
				})),
			})),
			getByLabel: mock(() => ({
				count: mock(() => Promise.resolve(0)),
				first: mock(() => ({
					selectOption: mock(() => Promise.reject(new Error("not found"))),
				})),
			})),
		});
		const flow: FlowConfig = {
			steps: [{ select: { Country: "UK" } }],
		};
		const { results } = await runFlow("select-fail", flow, {}, deps, false);
		expect(results[0].passed).toBe(false);
		expect(results[0].error).toContain("Country");
	});
});

// --- formatFlowReport tests ---

describe("formatFlowReport", () => {
	test("formats report with all passing steps", () => {
		const results: StepResult[] = [
			{ stepNum: 1, description: "goto https://example.com", passed: true },
			{ stepNum: 2, description: "click Login", passed: true },
			{ stepNum: 3, description: "fill Email", passed: true },
		];
		const report = formatFlowReport("login-flow", results, 3, []);
		expect(report).toContain("Flow: login-flow (3/3 steps completed)");
		expect(report).toContain("✓ Step 1: goto https://example.com");
		expect(report).toContain("✓ Step 2: click Login");
		expect(report).toContain("✓ Step 3: fill Email");
		expect(report).toContain("(none taken)");
	});

	test("formats report with failing steps", () => {
		const results: StepResult[] = [
			{ stepNum: 1, description: "goto https://example.com", passed: true },
			{
				stepNum: 2,
				description: "click Submit",
				passed: false,
				error: "Element not found: 'Submit'",
			},
		];
		const report = formatFlowReport("submit-flow", results, 3, []);
		expect(report).toContain("Flow: submit-flow (1/3 steps completed)");
		expect(report).toContain("✓ Step 1");
		expect(report).toContain("✗ Step 2: click Submit");
		expect(report).toContain("→ Element not found: 'Submit'");
	});

	test("formats report with screenshots", () => {
		const screenshotPath = "/home/user/.bun-browse/screenshots/test.png";
		const results: StepResult[] = [
			{ stepNum: 1, description: "goto https://example.com", passed: true },
			{
				stepNum: 2,
				description: "screenshot",
				passed: true,
				screenshotPath,
			},
		];
		const report = formatFlowReport("screenshot-flow", results, 2, [
			screenshotPath,
		]);
		expect(report).toContain("Flow: screenshot-flow (2/2 steps completed)");
		expect(report).toContain(`→ ${screenshotPath}`);
		expect(report).toContain("Screenshots:");
		expect(report).toContain(`Step 2: ${screenshotPath}`);
		expect(report).not.toContain("(none taken)");
	});

	test("formats report with no screenshots section correctly", () => {
		const results: StepResult[] = [
			{ stepNum: 1, description: "goto https://example.com", passed: true },
		];
		const report = formatFlowReport("no-screenshots", results, 1, []);
		expect(report).toContain("Screenshots:");
		expect(report).toContain("(none taken)");
	});

	test("formats report with multiple screenshots", () => {
		const path1 = "/tmp/shot1.png";
		const path2 = "/tmp/shot2.png";
		const results: StepResult[] = [
			{
				stepNum: 1,
				description: "screenshot",
				passed: true,
				screenshotPath: path1,
			},
			{ stepNum: 2, description: "click Login", passed: true },
			{
				stepNum: 3,
				description: "screenshot",
				passed: true,
				screenshotPath: path2,
			},
		];
		const report = formatFlowReport("multi-shot", results, 3, [path1, path2]);
		expect(report).toContain("Screenshots:");
		expect(report).toContain(`Step 1: ${path1}`);
		expect(report).toContain(`Step 3: ${path2}`);
	});

	test("counts only passing steps in the completed tally", () => {
		const results: StepResult[] = [
			{ stepNum: 1, description: "goto https://a.com", passed: true },
			{
				stepNum: 2,
				description: "click Missing",
				passed: false,
				error: "Not found",
			},
			{ stepNum: 3, description: "goto https://b.com", passed: true },
		];
		const report = formatFlowReport("mixed", results, 5, []);
		// 2 passed out of 5 total
		expect(report).toContain("Flow: mixed (2/5 steps completed)");
	});

	test("uses totalSteps parameter not results length for denominator", () => {
		// If execution stopped early, totalSteps reflects the full flow length
		const results: StepResult[] = [
			{ stepNum: 1, description: "goto https://a.com", passed: true },
			{
				stepNum: 2,
				description: "click Missing",
				passed: false,
				error: "Fail",
			},
		];
		const report = formatFlowReport("partial", results, 10, []);
		expect(report).toContain("Flow: partial (1/10 steps completed)");
	});

	test("handles empty results", () => {
		const report = formatFlowReport("empty-flow", [], 0, []);
		expect(report).toContain("Flow: empty-flow (0/0 steps completed)");
		expect(report).toContain("(none taken)");
	});

	test("does not show error arrow for passing steps", () => {
		const results: StepResult[] = [
			{ stepNum: 1, description: "goto https://example.com", passed: true },
		];
		const report = formatFlowReport("no-error", results, 1, []);
		const lines = report.split("\n");
		const step1Lines = lines.filter(
			(l) => l.includes("Step 1") || l.includes("→"),
		);
		// Only the Step 1 line, no arrow lines for passing steps without screenshots
		expect(step1Lines).toHaveLength(1);
	});

	test("shows both screenshot path and error for failed screenshot step", () => {
		// A step can have both screenshotPath and error if it took a screenshot
		// but then failed some other way. In practice the source only sets
		// screenshotPath on success, but formatFlowReport handles both fields.
		const results: StepResult[] = [
			{
				stepNum: 1,
				description: "screenshot",
				passed: false,
				error: "Unexpected failure after save",
				screenshotPath: "/tmp/partial.png",
			},
		];
		const report = formatFlowReport("both-fields", results, 1, [
			"/tmp/partial.png",
		]);
		expect(report).toContain("→ /tmp/partial.png");
		expect(report).toContain("→ Unexpected failure after save");
	});
});
