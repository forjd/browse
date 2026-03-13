import { describe, expect, mock, test } from "bun:test";
import { handleScroll } from "../src/commands/scroll.ts";
import {
	type AccessibilityNode,
	assignRefs,
	clearRefs,
	markStale,
} from "../src/refs.ts";

function makeTree(...children: AccessibilityNode[]): AccessibilityNode {
	return { role: "WebArea", name: "Page", children };
}

function mockPage(viewportHeight = 900) {
	return {
		viewportSize: mock(() => ({ width: 1440, height: viewportHeight })),
		evaluate: mock((_fn: unknown, _arg?: unknown) => Promise.resolve()),
		getByRole: mock((_role: string, _opts?: Record<string, unknown>) => ({
			nth: mock((_n: number) => ({
				scrollIntoViewIfNeeded: mock(() => Promise.resolve()),
			})),
			scrollIntoViewIfNeeded: mock(() => Promise.resolve()),
		})),
	} as never;
}

describe("handleScroll", () => {
	test("returns error when no args given", async () => {
		const result = await handleScroll(mockPage(), []);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("returns error for unknown subcommand", async () => {
		const result = await handleScroll(mockPage(), ["sideways"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown scroll target");
		}
	});

	test("scrolls down one viewport height", async () => {
		const page = mockPage(900);

		const result = await handleScroll(page, ["down"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("down");
			expect(result.data).toContain("900");
		}
	});

	test("scrolls up one viewport height", async () => {
		const page = mockPage(900);

		const result = await handleScroll(page, ["up"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("up");
			expect(result.data).toContain("900");
		}
	});

	test("scrolls to top", async () => {
		const result = await handleScroll(mockPage(), ["top"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("top");
		}
	});

	test("scrolls to bottom", async () => {
		const result = await handleScroll(mockPage(), ["bottom"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("bottom");
		}
	});

	test("scrolls element into view by ref", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Submit", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleScroll(page, ["@e1"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("@e1");
			expect(result.data).toContain("into view");
		}
	});

	test("returns error for unknown ref", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "OK", children: [] }),
			"default",
		);

		const result = await handleScroll(mockPage(), ["@e99"]);

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

		const result = await handleScroll(mockPage(), ["@e1"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("stale");
		}
	});

	test("scrolls to x,y coordinates", async () => {
		const result = await handleScroll(mockPage(), ["0", "500"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("0");
			expect(result.data).toContain("500");
		}
	});

	test("returns error for non-numeric coordinates", async () => {
		const result = await handleScroll(mockPage(), ["abc", "500"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown scroll target");
		}
	});

	test("returns error when only x coordinate given", async () => {
		const result = await handleScroll(mockPage(), ["100"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown scroll target");
		}
	});

	test("returns error when y coordinate is not a number", async () => {
		const result = await handleScroll(mockPage(), ["100", "abc"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("must be numbers");
		}
	});
});
