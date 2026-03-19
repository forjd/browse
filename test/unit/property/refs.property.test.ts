import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
	type AccessibilityNode,
	assignRefs,
	clearRefs,
	isInteractive,
} from "../../../src/refs.ts";

const INTERACTIVE_ROLES = [
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

const NON_INTERACTIVE_ROLES = [
	"heading",
	"paragraph",
	"list",
	"listitem",
	"img",
	"table",
	"cell",
	"row",
	"text",
	"navigation",
	"main",
	"section",
	"div",
];

const ALL_ROLES = [...INTERACTIVE_ROLES, ...NON_INTERACTIVE_ROLES];

/** Arbitrary for a leaf AccessibilityNode */
const arbNode: fc.Arbitrary<AccessibilityNode> = fc.record({
	role: fc.constantFrom(...ALL_ROLES),
	name: fc.string({ minLength: 1, maxLength: 20 }),
});

/** Arbitrary for a tree of AccessibilityNodes (max depth 3) */
function arbTree(maxDepth: number): fc.Arbitrary<AccessibilityNode> {
	if (maxDepth <= 0) return arbNode;
	return fc.record({
		role: fc.constantFrom(...ALL_ROLES),
		name: fc.string({ minLength: 1, maxLength: 20 }),
		children: fc.option(fc.array(arbTree(maxDepth - 1), { maxLength: 5 }), {
			nil: undefined,
		}),
	});
}

/** Collect all interactive nodes from a tree in depth-first order */
function collectInteractive(nodes: AccessibilityNode[]): AccessibilityNode[] {
	const result: AccessibilityNode[] = [];
	function walk(node: AccessibilityNode): void {
		if (isInteractive(node.role) && node.name) {
			result.push(node);
		}
		if (node.children) {
			for (const child of node.children) walk(child);
		}
	}
	for (const node of nodes) walk(node);
	return result;
}

describe("ref assignment — property-based tests", () => {
	test("same tree always produces identical ref assignments (deterministic)", () => {
		fc.assert(
			fc.property(
				fc.array(arbTree(2), { minLength: 0, maxLength: 8 }),
				(tree) => {
					clearRefs();
					const refs1 = assignRefs(tree, "default");
					clearRefs();
					const refs2 = assignRefs(tree, "default");

					expect([...refs1.entries()]).toEqual([...refs2.entries()]);
				},
			),
		);
	});

	test("refs are sequential from @e1 with no gaps", () => {
		fc.assert(
			fc.property(
				fc.array(arbTree(2), { minLength: 0, maxLength: 10 }),
				(tree) => {
					clearRefs();
					const refs = assignRefs(tree, "default");

					const keys = [...refs.keys()];
					for (let i = 0; i < keys.length; i++) {
						expect(keys[i]).toBe(`@e${i + 1}`);
					}
				},
			),
		);
	});

	test("no duplicate refs in a single snapshot", () => {
		fc.assert(
			fc.property(
				fc.array(arbTree(2), { minLength: 0, maxLength: 10 }),
				(tree) => {
					clearRefs();
					const refs = assignRefs(tree, "default");

					const keys = [...refs.keys()];
					const unique = new Set(keys);
					expect(unique.size).toBe(keys.length);
				},
			),
		);
	});

	test("only interactive roles receive refs", () => {
		fc.assert(
			fc.property(
				fc.array(arbTree(2), { minLength: 1, maxLength: 10 }),
				(tree) => {
					clearRefs();
					const refs = assignRefs(tree, "default");

					for (const entry of refs.values()) {
						expect(isInteractive(entry.role)).toBe(true);
					}
				},
			),
		);
	});

	test("ref count equals number of interactive named nodes in tree", () => {
		fc.assert(
			fc.property(
				fc.array(arbTree(2), { minLength: 0, maxLength: 10 }),
				(tree) => {
					clearRefs();
					const refs = assignRefs(tree, "default");
					const interactive = collectInteractive(tree);
					expect(refs.size).toBe(interactive.length);
				},
			),
		);
	});

	test("depth-first order: refs match tree walk order", () => {
		fc.assert(
			fc.property(
				fc.array(arbTree(3), { minLength: 0, maxLength: 8 }),
				(tree) => {
					clearRefs();
					const refs = assignRefs(tree, "default");
					const interactive = collectInteractive(tree);

					const refEntries = [...refs.values()];
					for (let i = 0; i < refEntries.length; i++) {
						expect(refEntries[i].role).toBe(interactive[i].role);
						expect(refEntries[i].name).toBe(interactive[i].name);
					}
				},
			),
		);
	});

	test("duplicate name tracking: nthMatch is correct and totalMatches consistent", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						role: fc.constantFrom(...INTERACTIVE_ROLES),
						name: fc.constantFrom("A", "B", "C"),
					}),
					{ minLength: 1, maxLength: 20 },
				),
				(nodes) => {
					clearRefs();
					const refs = assignRefs(nodes, "default");

					// Group by role::name to verify counts
					const groups = new Map<string, number>();
					for (const entry of refs.values()) {
						const key = `${entry.role}::${entry.name}`;
						groups.set(key, (groups.get(key) ?? 0) + 1);
					}

					for (const entry of refs.values()) {
						const key = `${entry.role}::${entry.name}`;
						// totalMatches should match our independent count
						expect(entry.totalMatches).toBe(groups.get(key));
						// nthMatch should be in valid range
						expect(entry.nthMatch).toBeGreaterThanOrEqual(0);
						expect(entry.nthMatch).toBeLessThan(entry.totalMatches);
					}
				},
			),
		);
	});
});
