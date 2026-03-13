import { describe, expect, mock, test } from "bun:test";
import {
	type AccessibilityNode,
	assignRefs,
	clearRefs,
	getRefs,
	getRefsGeneration,
	isStale,
	markStale,
	parseAriaSnapshot,
	resolveLocator,
	resolveRef,
} from "../src/refs.ts";

function makeNode(
	role: string,
	name: string,
	children?: AccessibilityNode[],
): AccessibilityNode {
	return { role, name, children };
}

describe("parseAriaSnapshot", () => {
	test("parses simple nodes", () => {
		const snapshot = `- heading "Title" [level=1]\n- button "Submit"`;
		const nodes = parseAriaSnapshot(snapshot);

		expect(nodes.length).toBe(2);
		expect(nodes[0].role).toBe("heading");
		expect(nodes[0].name).toBe("Title");
		expect(nodes[0].level).toBe(1);
		expect(nodes[1].role).toBe("button");
		expect(nodes[1].name).toBe("Submit");
	});

	test("parses nested nodes", () => {
		const snapshot = `- navigation "Main":\n  - link "Home"\n  - link "About"`;
		const nodes = parseAriaSnapshot(snapshot);

		expect(nodes.length).toBe(1);
		expect(nodes[0].role).toBe("navigation");
		expect(nodes[0].children?.length).toBe(2);
		expect(nodes[0].children?.[0].name).toBe("Home");
	});

	test("parses text content as name", () => {
		const snapshot = `- paragraph: Welcome back.`;
		const nodes = parseAriaSnapshot(snapshot);

		expect(nodes[0].role).toBe("paragraph");
		expect(nodes[0].name).toBe("Welcome back.");
	});

	test("skips /url metadata lines", () => {
		const snapshot = `- link "Home":\n  - /url: "#home"`;
		const nodes = parseAriaSnapshot(snapshot);

		expect(nodes.length).toBe(1);
		expect(nodes[0].children).toBeUndefined();
	});

	test("parses text nodes with quoted content", () => {
		const snapshot = `- text: "Count: 0"`;
		const nodes = parseAriaSnapshot(snapshot);

		expect(nodes[0].role).toBe("text");
		expect(nodes[0].name).toBe("Count: 0");
	});
});

describe("assignRefs", () => {
	test("assigns sequential refs to interactive elements", () => {
		const nodes = [
			makeNode("link", "Home"),
			makeNode("button", "Submit"),
			makeNode("textbox", "Email"),
		];

		const refs = assignRefs(nodes, "default");

		expect(refs.size).toBe(3);
		expect(refs.get("@e1")?.role).toBe("link");
		expect(refs.get("@e1")?.name).toBe("Home");
		expect(refs.get("@e2")?.role).toBe("button");
		expect(refs.get("@e3")?.role).toBe("textbox");
	});

	test("skips non-interactive elements", () => {
		const nodes = [
			makeNode("heading", "Title"),
			makeNode("paragraph", "Some text"),
			makeNode("button", "Click me"),
		];

		const refs = assignRefs(nodes, "default");

		expect(refs.size).toBe(1);
		expect(refs.get("@e1")?.role).toBe("button");
	});

	test("walks tree depth-first for nested nodes", () => {
		const nodes = [
			makeNode("navigation", "Nav", [
				makeNode("link", "Home"),
				makeNode("link", "About"),
			]),
			makeNode("button", "Submit"),
		];

		const refs = assignRefs(nodes, "default");

		expect(refs.get("@e1")?.name).toBe("Home");
		expect(refs.get("@e2")?.name).toBe("About");
		expect(refs.get("@e3")?.name).toBe("Submit");
	});

	test("increments generation on each call", () => {
		clearRefs();
		const nodes = [makeNode("button", "OK")];

		const gen1 = getRefsGeneration();
		assignRefs(nodes, "default");
		const gen2 = getRefsGeneration();
		assignRefs(nodes, "default");
		const gen3 = getRefsGeneration();

		expect(gen2).toBe(gen1 + 1);
		expect(gen3).toBe(gen2 + 1);
	});

	test("clears stale flag on new assignment", () => {
		clearRefs();
		const nodes = [makeNode("button", "OK")];

		markStale();
		expect(isStale()).toBe(true);

		assignRefs(nodes, "default");
		expect(isStale()).toBe(false);
	});

	test("skips unnamed elements", () => {
		const nodes = [makeNode("button", ""), makeNode("button", "Valid")];

		const refs = assignRefs(nodes, "default");

		expect(refs.size).toBe(1);
		expect(refs.get("@e1")?.name).toBe("Valid");
	});

	test("handles duplicate role+name by tracking count", () => {
		const nodes = [
			makeNode("button", "Delete"),
			makeNode("button", "Delete"),
			makeNode("button", "Delete"),
		];

		const refs = assignRefs(nodes, "default");

		expect(refs.size).toBe(3);
		expect(refs.get("@e1")?.nthMatch).toBe(0);
		expect(refs.get("@e1")?.totalMatches).toBe(3);
		expect(refs.get("@e2")?.nthMatch).toBe(1);
		expect(refs.get("@e3")?.nthMatch).toBe(2);
	});

	test("accepts a single root node with children", () => {
		const tree: AccessibilityNode = makeNode("WebArea", "Page", [
			makeNode("button", "OK"),
		]);

		const refs = assignRefs(tree, "default");
		expect(refs.size).toBe(1);
		expect(refs.get("@e1")?.name).toBe("OK");
	});
});

describe("resolveRef", () => {
	test("returns entry for valid ref", () => {
		clearRefs();
		assignRefs([makeNode("button", "Submit")], "default");

		const result = resolveRef("@e1");
		expect("ref" in result).toBe(true);
		if ("ref" in result) {
			expect(result.role).toBe("button");
			expect(result.name).toBe("Submit");
		}
	});

	test("returns error for unknown ref", () => {
		clearRefs();
		assignRefs([makeNode("button", "Submit")], "default");

		const result = resolveRef("@e99");
		expect("error" in result).toBe(true);
		if ("error" in result) {
			expect(result.error).toContain("Unknown ref");
			expect(result.error).toContain("browse snapshot");
		}
	});

	test("returns stale error when refs are stale", () => {
		clearRefs();
		assignRefs([makeNode("button", "Submit")], "default");
		markStale();

		const result = resolveRef("@e1");
		expect("error" in result).toBe(true);
		if ("error" in result) {
			expect(result.error).toContain("stale");
			expect(result.error).toContain("browse snapshot");
		}
	});

	test("returns error when no refs exist", () => {
		clearRefs();

		const result = resolveRef("@e1");
		expect("error" in result).toBe(true);
	});
});

describe("clearRefs", () => {
	test("removes all refs", () => {
		assignRefs([makeNode("button", "OK")], "default");
		expect(getRefs().size).toBeGreaterThan(0);

		clearRefs();
		expect(getRefs().size).toBe(0);
	});
});

describe("markStale", () => {
	test("sets stale flag", () => {
		clearRefs();
		assignRefs([makeNode("button", "OK")], "default");

		expect(isStale()).toBe(false);
		markStale();
		expect(isStale()).toBe(true);
	});
});

describe("resolveLocator", () => {
	function mockPage() {
		const locatorResult = { _type: "css-locator" };
		const roleResult = {
			_type: "role-locator",
			nth: mock(() => ({ _type: "role-locator-nth" })),
		};
		return {
			locator: mock((_sel: string) => ({ first: () => locatorResult })),
			getByRole: mock(
				(_role: string, _opts?: Record<string, unknown>) => roleResult,
			),
			_locatorResult: locatorResult,
			_roleResult: roleResult,
		};
	}

	test("returns CSS locator for non-ref string", () => {
		const page = mockPage();
		const result = resolveLocator(page as any, ".btn");
		expect("locator" in result).toBe(true);
		if ("locator" in result) {
			expect(page.locator).toHaveBeenCalledWith(".btn");
		}
	});

	test("returns role-based locator for ref string", () => {
		clearRefs();
		assignRefs([makeNode("button", "Submit")], "default");
		const page = mockPage();

		const result = resolveLocator(page as any, "@e1");
		expect("locator" in result).toBe(true);
		if ("locator" in result) {
			expect(page.getByRole).toHaveBeenCalled();
		}
	});

	test("returns error for unknown ref", () => {
		clearRefs();
		assignRefs([makeNode("button", "Submit")], "default");
		const page = mockPage();

		const result = resolveLocator(page as any, "@e99");
		expect("error" in result).toBe(true);
	});

	test("returns error for stale ref", () => {
		clearRefs();
		assignRefs([makeNode("button", "Submit")], "default");
		markStale();
		const page = mockPage();

		const result = resolveLocator(page as any, "@e1");
		expect("error" in result).toBe(true);
		if ("error" in result) {
			expect(result.error).toContain("stale");
		}
	});
});
