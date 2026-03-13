import { describe, expect, mock, test } from "bun:test";
import { handleAttr } from "../src/commands/attr.ts";
import {
	type AccessibilityNode,
	assignRefs,
	clearRefs,
	markStale,
} from "../src/refs.ts";

function makeTree(...children: AccessibilityNode[]): AccessibilityNode {
	return { role: "WebArea", name: "Page", children };
}

function mockPage(attrs: Record<string, string | null> = {}) {
	return {
		getByRole: mock((_role: string, _opts?: Record<string, unknown>) => {
			const locator = {
				nth: mock((_n: number) => ({
					getAttribute: mock((name: string) =>
						Promise.resolve(attrs[name] ?? null),
					),
					evaluate: mock((fn: (el: Element) => unknown) => {
						// Simulate calling the fn with a mock element
						const mockEl = {
							attributes: Object.entries(attrs)
								.filter(([, v]) => v !== null)
								.map(([k, v]) => ({ name: k, value: v })),
						};
						return Promise.resolve(fn(mockEl as unknown as Element));
					}),
				})),
				getAttribute: mock((name: string) =>
					Promise.resolve(attrs[name] ?? null),
				),
				evaluate: mock((fn: (el: Element) => unknown) => {
					const mockEl = {
						attributes: Object.entries(attrs)
							.filter(([, v]) => v !== null)
							.map(([k, v]) => ({ name: k, value: v })),
					};
					return Promise.resolve(fn(mockEl as unknown as Element));
				}),
			};
			return locator;
		}),
	} as never;
}

describe("handleAttr", () => {
	test("returns a single attribute value", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "link", name: "Home", children: [] }),
			"default",
		);
		const page = mockPage({ href: "/home", class: "nav-link active" });

		const result = await handleAttr(page, ["@e1", "href"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBe("/home");
		}
	});

	test("returns all attributes as key=value pairs when no attribute name given", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "link", name: "Home", children: [] }),
			"default",
		);
		const page = mockPage({
			href: "/home",
			class: "nav-link",
			"aria-current": "page",
		});

		const result = await handleAttr(page, ["@e1"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("href=/home");
			expect(result.data).toContain("class=nav-link");
			expect(result.data).toContain("aria-current=page");
		}
	});

	test("returns empty string for attribute that exists but is empty", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Submit", children: [] }),
			"default",
		);
		const page = mockPage({ disabled: "" });

		const result = await handleAttr(page, ["@e1", "disabled"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBe("");
		}
	});

	test("returns message when single attribute is not found", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Submit", children: [] }),
			"default",
		);
		const page = mockPage({});

		const result = await handleAttr(page, ["@e1", "aria-label"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("no attribute");
		}
	});

	test("returns message when element has no attributes", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "OK", children: [] }),
			"default",
		);
		const page = mockPage({});

		const result = await handleAttr(page, ["@e1"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("no attributes");
		}
	});

	test("returns error when ref arg is missing", async () => {
		clearRefs();
		const page = mockPage();

		const result = await handleAttr(page, []);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("returns error when ref does not start with @", async () => {
		clearRefs();
		const page = mockPage();

		const result = await handleAttr(page, ["e1"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("@");
		}
	});

	test("returns error for unknown ref", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "OK", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleAttr(page, ["@e99"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown ref");
		}
	});

	test("returns stale error after navigation", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "OK", children: [] }),
			"default",
		);
		markStale();
		const page = mockPage();

		const result = await handleAttr(page, ["@e1"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("stale");
		}
	});

	test("handles duplicate refs with nth matching", async () => {
		clearRefs();
		assignRefs(
			makeTree(
				{ role: "link", name: "Edit", children: [] },
				{ role: "link", name: "Edit", children: [] },
			),
			"default",
		);
		const page = mockPage({ href: "/edit/2" });

		const result = await handleAttr(page, ["@e2", "href"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBe("/edit/2");
		}
	});
});
