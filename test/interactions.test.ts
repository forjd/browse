import { describe, expect, mock, test } from "bun:test";
import { handleClick } from "../src/commands/click.ts";
import { handleFill } from "../src/commands/fill.ts";
import { handleSelect } from "../src/commands/select.ts";
import {
	type AccessibilityNode,
	assignRefs,
	clearRefs,
	markStale,
} from "../src/refs.ts";

function makeTree(...children: AccessibilityNode[]): AccessibilityNode {
	return { role: "WebArea", name: "Page", children };
}

function mockPage() {
	return {
		getByRole: mock((_role: string, _opts?: Record<string, unknown>) => ({
			nth: mock((_n: number) => ({
				click: mock(() => Promise.resolve()),
				fill: mock(() => Promise.resolve()),
				selectOption: mock(() => Promise.resolve()),
			})),
			click: mock(() => Promise.resolve()),
			fill: mock(() => Promise.resolve()),
			selectOption: mock(() => Promise.resolve()),
		})),
	} as never;
}

describe("handleClick", () => {
	test("clicks a resolved ref and returns confirmation", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Submit", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleClick(page, ["@e1"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Clicked");
			expect(result.data).toContain("@e1");
			expect(result.data).toContain("Submit");
		}
	});

	test("returns error when ref arg is missing", async () => {
		clearRefs();
		const page = mockPage();

		const result = await handleClick(page, []);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("returns error when ref does not start with @", async () => {
		clearRefs();
		const page = mockPage();

		const result = await handleClick(page, ["e1"]);

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

		const result = await handleClick(page, ["@e99"]);

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

		const result = await handleClick(page, ["@e1"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("stale");
		}
	});
});

describe("handleFill", () => {
	test("fills a textbox and returns confirmation", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "textbox", name: "Email", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleFill(page, ["@e1", "test@example.com"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Filled");
			expect(result.data).toContain("@e1");
			expect(result.data).toContain("test@example.com");
		}
	});

	test("joins multi-word values", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "textbox", name: "Search", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleFill(page, ["@e1", "hello", "world"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("hello world");
		}
	});

	test("returns error when ref is missing", async () => {
		clearRefs();
		const page = mockPage();

		const result = await handleFill(page, []);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("returns error when value is missing", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "textbox", name: "Email", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleFill(page, ["@e1"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("returns error when target is not a fillable element", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Submit", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleFill(page, ["@e1", "text"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("not a fillable element");
		}
	});

	test("allows filling searchbox elements", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "searchbox", name: "Search", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleFill(page, ["@e1", "query"]);

		expect(result.ok).toBe(true);
	});
});

describe("handleSelect", () => {
	test("selects an option and returns confirmation", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "combobox", name: "Role", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleSelect(page, ["@e1", "Admin"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Selected");
			expect(result.data).toContain("Admin");
			expect(result.data).toContain("@e1");
		}
	});

	test("returns error when ref is missing", async () => {
		clearRefs();
		const page = mockPage();

		const result = await handleSelect(page, []);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("returns error when option is missing", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "combobox", name: "Role", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleSelect(page, ["@e1"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("returns error when target is not a selectable element", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Submit", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleSelect(page, ["@e1", "Option"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("not a selectable element");
		}
	});

	test("allows selecting from listbox elements", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "listbox", name: "Options", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleSelect(page, ["@e1", "Item 1"]);

		expect(result.ok).toBe(true);
	});
});
