import { describe, expect, mock, test } from "bun:test";
import { handleClick } from "../src/commands/click.ts";
import { handleFill } from "../src/commands/fill.ts";
import { handleHover } from "../src/commands/hover.ts";
import { handlePress } from "../src/commands/press.ts";
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
		keyboard: {
			press: mock((_key: string) => Promise.resolve()),
		},
		getByRole: mock((_role: string, _opts?: Record<string, unknown>) => ({
			nth: mock((_n: number) => ({
				click: mock(() => Promise.resolve()),
				fill: mock(() => Promise.resolve()),
				hover: mock(() => Promise.resolve()),
				selectOption: mock(() => Promise.resolve()),
			})),
			click: mock(() => Promise.resolve()),
			fill: mock(() => Promise.resolve()),
			hover: mock(() => Promise.resolve()),
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

	test("clicks combobox elements with force to bypass actionability checks", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "combobox", name: "Select option...", children: [] }),
			"default",
		);

		const clickMock = mock(() => Promise.resolve());
		const page = {
			getByRole: mock((_role: string, _opts?: Record<string, unknown>) => ({
				nth: mock((_n: number) => ({
					click: clickMock,
				})),
				click: clickMock,
			})),
		} as never;

		const result = await handleClick(page, ["@e1"]);

		expect(result.ok).toBe(true);
		expect(clickMock).toHaveBeenCalledWith({ timeout: 10_000, force: true });
	});

	test("clicks non-combobox elements without force", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Submit", children: [] }),
			"default",
		);

		const clickMock = mock(() => Promise.resolve());
		const page = {
			getByRole: mock((_role: string, _opts?: Record<string, unknown>) => ({
				nth: mock((_n: number) => ({
					click: clickMock,
				})),
				click: clickMock,
			})),
		} as never;

		const result = await handleClick(page, ["@e1"]);

		expect(result.ok).toBe(true);
		expect(clickMock).toHaveBeenCalledWith({ timeout: 10_000 });
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

describe("handlePress", () => {
	test("presses a single key and returns confirmation", async () => {
		const page = mockPage();

		const result = await handlePress(page, ["Tab"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Pressed");
			expect(result.data).toContain("Tab");
		}
		expect(page.keyboard.press).toHaveBeenCalledTimes(1);
		expect(page.keyboard.press).toHaveBeenCalledWith("Tab");
	});

	test("presses multiple sequential keys", async () => {
		const page = mockPage();

		const result = await handlePress(page, ["Tab", "Tab", "Tab"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Tab, Tab, Tab");
		}
		expect(page.keyboard.press).toHaveBeenCalledTimes(3);
	});

	test("presses a key combination", async () => {
		const page = mockPage();

		const result = await handlePress(page, ["Shift+Tab"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Shift+Tab");
		}
		expect(page.keyboard.press).toHaveBeenCalledWith("Shift+Tab");
	});

	test("returns error when no key is provided", async () => {
		const page = mockPage();

		const result = await handlePress(page, []);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("propagates Playwright errors", async () => {
		const page = mockPage();
		(page.keyboard.press as ReturnType<typeof mock>).mockImplementation(() => {
			throw new Error("keyboard.press: Unknown key: FooBar");
		});

		const result = await handlePress(page, ["FooBar"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown key");
		}
	});
});

describe("handleHover", () => {
	test("hovers a resolved ref and returns confirmation", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Menu", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleHover(page, ["@e1"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Hovered");
			expect(result.data).toContain("@e1");
			expect(result.data).toContain("Menu");
		}
	});

	test("returns error when ref arg is missing", async () => {
		clearRefs();
		const page = mockPage();

		const result = await handleHover(page, []);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("returns error when ref does not start with @", async () => {
		clearRefs();
		const page = mockPage();

		const result = await handleHover(page, ["e1"]);

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

		const result = await handleHover(page, ["@e99"]);

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

		const result = await handleHover(page, ["@e1"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("stale");
		}
	});

	test("passes duration option when --duration flag is provided", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "link", name: "Info", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleHover(page, ["@e1", "--duration", "2000"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Hovered");
			expect(result.data).toContain("2000ms");
		}
	});

	test("returns error for invalid duration value", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "OK", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleHover(page, ["@e1", "--duration", "abc"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("duration");
		}
	});
});
