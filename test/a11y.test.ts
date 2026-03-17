import { describe, expect, mock, test } from "bun:test";
import { handleA11y } from "../src/commands/a11y.ts";
import {
	type AccessibilityNode,
	assignRefs,
	clearRefs,
	markStale,
} from "../src/refs.ts";

function makeTree(...children: AccessibilityNode[]): AccessibilityNode {
	return { role: "WebArea", name: "Page", children };
}

// AxeBuilder mock factory
function createMockAxeBuilder(violations: unknown[] = []) {
	const instance = {
		withTags: mock((_tags: string[]) => instance),
		include: mock((_selector: string) => instance),
		exclude: mock((_selector: string) => instance),
		analyze: mock(() => Promise.resolve({ violations })),
	};
	return {
		instance,
		constructor: mock(() => instance),
	};
}

// Sample violation fixture
function sampleViolation(overrides: Record<string, unknown> = {}) {
	return {
		id: "color-contrast",
		impact: "serious",
		description: "Elements must have sufficient colour contrast",
		help: "Ensure foreground and background colours meet WCAG 2 AA minimum contrast ratio thresholds",
		helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
		nodes: [
			{
				html: '<p style="color: #aaa">Low contrast</p>',
				target: ["p"],
				failureSummary:
					"Fix the following: Element has insufficient colour contrast",
			},
		],
		...overrides,
	};
}

describe("handleA11y", () => {
	test("reports violations grouped by impact", async () => {
		const criticalViolation = sampleViolation({
			id: "image-alt",
			impact: "critical",
			description: "Images must have alternate text",
			help: "Ensure every image has an alt attribute",
			nodes: [
				{
					html: '<img src="logo.png">',
					target: ["img"],
					failureSummary: "Fix: add alt text",
				},
			],
		});
		const seriousViolation = sampleViolation();

		const axe = createMockAxeBuilder([criticalViolation, seriousViolation]);
		const page = {} as never;

		const result = await handleA11y(page, [], axe.constructor);

		expect(result.ok).toBe(true);
		if (result.ok) {
			// Critical should appear before serious
			const critIdx = result.data.indexOf("CRITICAL");
			const seriousIdx = result.data.indexOf("SERIOUS");
			expect(critIdx).toBeLessThan(seriousIdx);
			expect(result.data).toContain("image-alt");
			expect(result.data).toContain("color-contrast");
			expect(result.data).toContain("2 violations");
		}
	});

	test("reports no violations as pass", async () => {
		const axe = createMockAxeBuilder([]);
		const page = {} as never;

		const result = await handleA11y(page, [], axe.constructor);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("No accessibility violations");
		}
	});

	test("passes --standard tag to withTags", async () => {
		const axe = createMockAxeBuilder([]);
		const page = {} as never;

		await handleA11y(page, ["--standard", "wcag2aa"], axe.constructor);

		expect(axe.instance.withTags).toHaveBeenCalledWith(["wcag2aa"]);
	});

	test("passes --standard wcag21aa", async () => {
		const axe = createMockAxeBuilder([]);
		const page = {} as never;

		await handleA11y(page, ["--standard", "wcag21aa"], axe.constructor);

		expect(axe.instance.withTags).toHaveBeenCalledWith(["wcag21aa"]);
	});

	test("rejects invalid --standard value", async () => {
		const axe = createMockAxeBuilder([]);
		const page = {} as never;

		const result = await handleA11y(
			page,
			["--standard", "invalid"],
			axe.constructor,
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Invalid standard");
		}
	});

	test("returns error when --standard has no value", async () => {
		const axe = createMockAxeBuilder([]);
		const page = {} as never;

		const result = await handleA11y(page, ["--standard"], axe.constructor);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("--standard");
		}
	});

	test("returns JSON when json option is true", async () => {
		const violation = sampleViolation();
		const axe = createMockAxeBuilder([violation]);
		const page = {} as never;

		const result = await handleA11y(page, [], axe.constructor, {
			json: true,
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			const parsed = JSON.parse(result.data);
			expect(parsed.violations).toHaveLength(1);
			expect(parsed.violations[0].id).toBe("color-contrast");
			expect(parsed.summary.total).toBe(1);
		}
	});

	test("returns JSON with no violations", async () => {
		const axe = createMockAxeBuilder([]);
		const page = {} as never;

		const result = await handleA11y(page, [], axe.constructor, {
			json: true,
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			const parsed = JSON.parse(result.data);
			expect(parsed.violations).toHaveLength(0);
			expect(parsed.summary.total).toBe(0);
		}
	});

	test("passes --include selector to AxeBuilder", async () => {
		const axe = createMockAxeBuilder([]);
		const page = {} as never;

		await handleA11y(page, ["--include", ".main"], axe.constructor);

		expect(axe.instance.include).toHaveBeenCalledWith(".main");
	});

	test("passes --exclude selector to AxeBuilder", async () => {
		const axe = createMockAxeBuilder([]);
		const page = {} as never;

		await handleA11y(page, ["--exclude", ".third-party"], axe.constructor);

		expect(axe.instance.exclude).toHaveBeenCalledWith(".third-party");
	});

	test("returns error when --include has no value", async () => {
		const axe = createMockAxeBuilder([]);
		const page = {} as never;

		const result = await handleA11y(page, ["--include"], axe.constructor);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("--include");
		}
	});

	test("returns error when --exclude has no value", async () => {
		const axe = createMockAxeBuilder([]);
		const page = {} as never;

		const result = await handleA11y(page, ["--exclude"], axe.constructor);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("--exclude");
		}
	});

	test("scopes audit to @ref element", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Submit", children: [] }),
			"default",
		);

		const axe = createMockAxeBuilder([]);
		const page = {
			getByRole: mock((_role: string, _opts?: Record<string, unknown>) => ({
				nth: mock(() => ({
					evaluate: mock((_fn: (el: Element) => unknown) => {
						return Promise.resolve("main > button.submit");
					}),
				})),
				evaluate: mock((_fn: (el: Element) => unknown) => {
					return Promise.resolve("main > button.submit");
				}),
			})),
		} as never;

		const result = await handleA11y(page, ["@e1"], axe.constructor);

		expect(result.ok).toBe(true);
		expect(axe.instance.include).toHaveBeenCalled();
	});

	test("returns error for unknown @ref", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "OK", children: [] }),
			"default",
		);

		const axe = createMockAxeBuilder([]);
		const page = {} as never;

		const result = await handleA11y(page, ["@e99"], axe.constructor);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown ref");
		}
	});

	test("returns error for stale refs", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "OK", children: [] }),
			"default",
		);
		markStale();

		const axe = createMockAxeBuilder([]);
		const page = {} as never;

		const result = await handleA11y(page, ["@e1"], axe.constructor);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("stale");
		}
	});

	test("handles multiple violations with same impact", async () => {
		const v1 = sampleViolation({ id: "rule-a", impact: "moderate" });
		const v2 = sampleViolation({ id: "rule-b", impact: "moderate" });
		const axe = createMockAxeBuilder([v1, v2]);
		const page = {} as never;

		const result = await handleA11y(page, [], axe.constructor);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("rule-a");
			expect(result.data).toContain("rule-b");
			expect(result.data).toContain("2 violations");
		}
	});

	test("shows element count per violation", async () => {
		const violation = sampleViolation({
			nodes: [
				{
					html: "<p>One</p>",
					target: ["p:nth-child(1)"],
					failureSummary: "Fix",
				},
				{
					html: "<p>Two</p>",
					target: ["p:nth-child(2)"],
					failureSummary: "Fix",
				},
			],
		});
		const axe = createMockAxeBuilder([violation]);
		const page = {} as never;

		const result = await handleA11y(page, [], axe.constructor);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("2 elements");
		}
	});

	test("combines multiple flags with json option", async () => {
		const axe = createMockAxeBuilder([]);
		const page = {} as never;

		const result = await handleA11y(
			page,
			["--standard", "wcag2aa", "--include", ".main", "--exclude", ".ad"],
			axe.constructor,
			{ json: true },
		);

		expect(axe.instance.withTags).toHaveBeenCalledWith(["wcag2aa"]);
		expect(axe.instance.include).toHaveBeenCalledWith(".main");
		expect(axe.instance.exclude).toHaveBeenCalledWith(".ad");
		expect(result.ok).toBe(true);
		if (result.ok) {
			const parsed = JSON.parse(result.data);
			expect(parsed.violations).toBeDefined();
			expect(parsed.summary).toBeDefined();
		}
	});
});
