import { describe, expect, mock, test } from "bun:test";
import {
	evaluateAssertCondition,
	parseAssertArgs,
} from "../src/commands/assert.ts";

describe("parseAssertArgs", () => {
	test("parses visible subcommand", () => {
		const result = parseAssertArgs(["visible", ".btn"]);
		expect(result).toEqual({ condition: { visible: ".btn" } });
	});

	test("parses not-visible subcommand", () => {
		const result = parseAssertArgs(["not-visible", ".btn"]);
		expect(result).toEqual({ condition: { notVisible: ".btn" } });
	});

	test("parses text-contains subcommand", () => {
		const result = parseAssertArgs(["text-contains", "Welcome back"]);
		expect(result).toEqual({ condition: { textContains: "Welcome back" } });
	});

	test("parses text-not-contains subcommand", () => {
		const result = parseAssertArgs(["text-not-contains", "Error"]);
		expect(result).toEqual({ condition: { textNotContains: "Error" } });
	});

	test("parses url-contains subcommand", () => {
		const result = parseAssertArgs(["url-contains", "/dashboard"]);
		expect(result).toEqual({ condition: { urlContains: "/dashboard" } });
	});

	test("parses url-pattern subcommand", () => {
		const result = parseAssertArgs(["url-pattern", "^https://"]);
		expect(result).toEqual({ condition: { urlPattern: "^https://" } });
	});

	test("parses element-text subcommand", () => {
		const result = parseAssertArgs(["element-text", "h1", "Welcome"]);
		expect(result).toEqual({
			condition: { elementText: { selector: "h1", contains: "Welcome" } },
		});
	});

	test("parses element-count subcommand", () => {
		const result = parseAssertArgs(["element-count", "li", "5"]);
		expect(result).toEqual({
			condition: { elementCount: { selector: "li", count: 5 } },
		});
	});

	test("returns error for unknown subcommand", () => {
		const result = parseAssertArgs(["badcmd", "arg"]);
		expect(result).toHaveProperty("error");
		expect((result as { error: string }).error).toContain(
			"Unknown assert type",
		);
	});

	test("returns error for missing arguments", () => {
		const result = parseAssertArgs(["visible"]);
		expect(result).toHaveProperty("error");
	});

	test("returns error for empty args", () => {
		const result = parseAssertArgs([]);
		expect(result).toHaveProperty("error");
	});

	test("parses element-text with missing text arg as error", () => {
		const result = parseAssertArgs(["element-text", "h1"]);
		expect(result).toHaveProperty("error");
	});

	test("parses element-count with non-numeric count as error", () => {
		const result = parseAssertArgs(["element-count", "li", "abc"]);
		expect(result).toHaveProperty("error");
	});

	test("parses permission subcommand", () => {
		const result = parseAssertArgs(["permission", "Create User", "granted"]);
		expect(result).toEqual({
			permission: { name: "Create User", direction: "granted" },
			vars: {},
		});
	});

	test("parses permission subcommand with vars", () => {
		const result = parseAssertArgs([
			"permission",
			"Create User",
			"granted",
			"--var",
			"base_url=https://example.com",
		]);
		expect(result).toEqual({
			permission: { name: "Create User", direction: "granted" },
			vars: { base_url: "https://example.com" },
		});
	});

	test("returns error for invalid permission direction", () => {
		const result = parseAssertArgs(["permission", "Create User", "allow"]);
		expect(result).toHaveProperty("error");
		expect((result as { error: string }).error).toContain("granted");
		expect((result as { error: string }).error).toContain("denied");
	});
});

// Mock page for evaluateAssertCondition tests
function createMockPage(opts: {
	url?: string;
	bodyText?: string;
	visibleSelectors?: Set<string>;
	elementTexts?: Record<string, string>;
	elementCounts?: Record<string, number>;
}) {
	return {
		url: () => opts.url ?? "https://example.com/dashboard",
		innerText: mock(async (selector: string) => {
			if (selector === "body") return opts.bodyText ?? "";
			return "";
		}),
		locator: (selector: string) => ({
			first: () => ({
				isVisible: mock(
					async () => opts.visibleSelectors?.has(selector) ?? false,
				),
				innerText: mock(async () => opts.elementTexts?.[selector] ?? ""),
			}),
			count: mock(async () => opts.elementCounts?.[selector] ?? 0),
		}),
	} as any;
}

describe("evaluateAssertCondition", () => {
	test("visible — passes when element is visible", async () => {
		const page = createMockPage({ visibleSelectors: new Set([".btn"]) });
		const result = await evaluateAssertCondition(page, { visible: ".btn" });
		expect(result.passed).toBe(true);
	});

	test("visible — fails when element not visible", async () => {
		const page = createMockPage({ visibleSelectors: new Set() });
		const result = await evaluateAssertCondition(page, { visible: ".btn" });
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("not found or not visible");
	});

	test("notVisible — passes when element not visible", async () => {
		const page = createMockPage({ visibleSelectors: new Set() });
		const result = await evaluateAssertCondition(page, { notVisible: ".btn" });
		expect(result.passed).toBe(true);
	});

	test("notVisible — fails when element is visible", async () => {
		const page = createMockPage({ visibleSelectors: new Set([".btn"]) });
		const result = await evaluateAssertCondition(page, { notVisible: ".btn" });
		expect(result.passed).toBe(false);
	});

	test("textContains — passes when text present", async () => {
		const page = createMockPage({ bodyText: "Welcome back, user!" });
		const result = await evaluateAssertCondition(page, {
			textContains: "Welcome back",
		});
		expect(result.passed).toBe(true);
	});

	test("textContains — case-insensitive", async () => {
		const page = createMockPage({ bodyText: "welcome BACK" });
		const result = await evaluateAssertCondition(page, {
			textContains: "Welcome back",
		});
		expect(result.passed).toBe(true);
	});

	test("textContains — fails when text absent", async () => {
		const page = createMockPage({ bodyText: "Hello" });
		const result = await evaluateAssertCondition(page, {
			textContains: "Welcome",
		});
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("does not contain");
	});

	test("textNotContains — passes when text absent", async () => {
		const page = createMockPage({ bodyText: "Hello" });
		const result = await evaluateAssertCondition(page, {
			textNotContains: "Error",
		});
		expect(result.passed).toBe(true);
	});

	test("textNotContains — fails when text present", async () => {
		const page = createMockPage({ bodyText: "Error occurred" });
		const result = await evaluateAssertCondition(page, {
			textNotContains: "Error",
		});
		expect(result.passed).toBe(false);
	});

	test("urlContains — passes when URL matches", async () => {
		const page = createMockPage({ url: "https://example.com/dashboard" });
		const result = await evaluateAssertCondition(page, {
			urlContains: "/dashboard",
		});
		expect(result.passed).toBe(true);
	});

	test("urlContains — fails when URL doesn't match", async () => {
		const page = createMockPage({ url: "https://example.com/login" });
		const result = await evaluateAssertCondition(page, {
			urlContains: "/dashboard",
		});
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("/dashboard");
	});

	test("urlPattern — passes when regex matches", async () => {
		const page = createMockPage({ url: "https://example.com/dashboard" });
		const result = await evaluateAssertCondition(page, {
			urlPattern: "^https://.*/(dashboard|home)",
		});
		expect(result.passed).toBe(true);
	});

	test("urlPattern — fails when regex doesn't match", async () => {
		const page = createMockPage({ url: "https://example.com/login" });
		const result = await evaluateAssertCondition(page, {
			urlPattern: "^https://.*/(dashboard|home)",
		});
		expect(result.passed).toBe(false);
	});

	test("elementText — passes when element text matches", async () => {
		const page = createMockPage({ elementTexts: { h1: "Welcome Home" } });
		const result = await evaluateAssertCondition(page, {
			elementText: { selector: "h1", contains: "Welcome" },
		});
		expect(result.passed).toBe(true);
	});

	test("elementText — fails when element text doesn't match", async () => {
		const page = createMockPage({ elementTexts: { h1: "Login" } });
		const result = await evaluateAssertCondition(page, {
			elementText: { selector: "h1", contains: "Welcome" },
		});
		expect(result.passed).toBe(false);
	});

	test("elementCount — passes when count matches", async () => {
		const page = createMockPage({ elementCounts: { li: 5 } });
		const result = await evaluateAssertCondition(page, {
			elementCount: { selector: "li", count: 5 },
		});
		expect(result.passed).toBe(true);
	});

	test("elementCount — fails when count doesn't match", async () => {
		const page = createMockPage({ elementCounts: { li: 5 } });
		const result = await evaluateAssertCondition(page, {
			elementCount: { selector: "li", count: 3 },
		});
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("5");
		expect(result.reason).toContain("3");
	});
});
