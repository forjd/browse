import { describe, expect, test } from "bun:test";
import {
	type AccessibilityNode,
	assignRefs,
	clearRefs,
} from "../../src/refs.ts";

function makeNode(
	role: string,
	name: string,
	children?: AccessibilityNode[],
): AccessibilityNode {
	return { role, name, children };
}

describe("ref assignment — deterministic ordering", () => {
	test("same tree always produces the same ref assignments", () => {
		const tree = [
			makeNode("navigation", "Nav", [
				makeNode("link", "Home"),
				makeNode("link", "About"),
			]),
			makeNode("button", "Submit"),
			makeNode("textbox", "Search"),
		];

		clearRefs();
		const refs1 = assignRefs(tree, "default");
		clearRefs();
		const refs2 = assignRefs(tree, "default");

		expect([...refs1.entries()]).toEqual([...refs2.entries()]);
	});

	test("refs are sequential starting from @e1", () => {
		clearRefs();
		const nodes = [
			makeNode("button", "A"),
			makeNode("button", "B"),
			makeNode("button", "C"),
		];

		const refs = assignRefs(nodes, "default");

		expect(refs.has("@e1")).toBe(true);
		expect(refs.has("@e2")).toBe(true);
		expect(refs.has("@e3")).toBe(true);
		expect(refs.has("@e4")).toBe(false);
	});
});

describe("ref assignment — element filtering", () => {
	test("default mode: only interactive elements get refs", () => {
		clearRefs();
		const nodes = [
			makeNode("heading", "Title"),
			makeNode("paragraph", "Text"),
			makeNode("button", "OK"),
			makeNode("link", "Home"),
			makeNode("textbox", "Email"),
			makeNode("checkbox", "Agree"),
			makeNode("radio", "Option A"),
			makeNode("listitem", "Item 1"),
		];

		const refs = assignRefs(nodes, "default");

		expect(refs.size).toBe(5);
		const roles = [...refs.values()].map((r) => r.role);
		expect(roles).toContain("button");
		expect(roles).toContain("link");
		expect(roles).toContain("textbox");
		expect(roles).toContain("checkbox");
		expect(roles).toContain("radio");
		expect(roles).not.toContain("heading");
		expect(roles).not.toContain("paragraph");
		expect(roles).not.toContain("listitem");
	});
});

describe("ref assignment — edge cases", () => {
	test("empty tree returns empty refs, no crash", () => {
		clearRefs();
		const refs = assignRefs([], "default");
		expect(refs.size).toBe(0);
	});

	test("deeply nested tree: correct depth-first ordering", () => {
		clearRefs();
		const tree = [
			makeNode("main", "Main", [
				makeNode("section", "S1", [
					makeNode("div", "D1", [makeNode("button", "Deep1")]),
				]),
				makeNode("section", "S2", [makeNode("button", "Deep2")]),
			]),
			makeNode("button", "Top"),
		];

		const refs = assignRefs(tree, "default");

		expect(refs.size).toBe(3);
		expect(refs.get("@e1")?.name).toBe("Deep1");
		expect(refs.get("@e2")?.name).toBe("Deep2");
		expect(refs.get("@e3")?.name).toBe("Top");
	});

	test("special characters in element names are preserved", () => {
		clearRefs();
		const nodes = [
			makeNode("button", 'Save & "Continue"'),
			makeNode("link", "Héllo Wörld"),
			makeNode("button", "Line\nBreak"),
			makeNode("textbox", "日本語"),
		];

		const refs = assignRefs(nodes, "default");

		expect(refs.size).toBe(4);
		expect(refs.get("@e1")?.name).toBe('Save & "Continue"');
		expect(refs.get("@e2")?.name).toBe("Héllo Wörld");
		expect(refs.get("@e3")?.name).toBe("Line\nBreak");
		expect(refs.get("@e4")?.name).toBe("日本語");
	});

	test("tree with only non-interactive elements returns empty refs", () => {
		clearRefs();
		const nodes = [
			makeNode("heading", "Title"),
			makeNode("paragraph", "Some text"),
			makeNode("list", "Items", [
				makeNode("listitem", "Item 1"),
				makeNode("listitem", "Item 2"),
			]),
		];

		const refs = assignRefs(nodes, "default");
		expect(refs.size).toBe(0);
	});

	test("single root node with no children", () => {
		clearRefs();
		const tree: AccessibilityNode = makeNode("WebArea", "Page");
		const refs = assignRefs(tree, "default");
		expect(refs.size).toBe(0);
	});

	test("all interactive roles are assigned refs", () => {
		clearRefs();
		const interactiveRoles = [
			"link",
			"button",
			"textbox",
			"searchbox",
			"combobox",
			"listbox",
			"checkbox",
			"radio",
			"slider",
			"spinbutton",
			"switch",
			"menuitem",
			"option",
			"tab",
		];

		const nodes = interactiveRoles.map((role) => makeNode(role, `${role}-el`));
		const refs = assignRefs(nodes, "default");

		expect(refs.size).toBe(interactiveRoles.length);
	});
});
