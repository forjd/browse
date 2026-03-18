import { describe, expect, test } from "bun:test";
import { buildTree, type CDPAXNode } from "../src/cdp-accessibility.ts";

function node(overrides: Partial<CDPAXNode> & { nodeId: string }): CDPAXNode {
	return {
		ignored: false,
		...overrides,
	};
}

describe("buildTree", () => {
	test("returns empty array for empty input", () => {
		expect(buildTree([])).toEqual([]);
	});

	test("excludes RootWebArea and promotes its children", () => {
		const nodes: CDPAXNode[] = [
			node({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				name: { type: "computedString", value: "Page" },
				childIds: ["2"],
			}),
			node({
				nodeId: "2",
				role: { type: "role", value: "heading" },
				name: { type: "computedString", value: "Title" },
				properties: [{ name: "level", value: { type: "integer", value: 1 } }],
			}),
		];

		const result = buildTree(nodes);
		expect(result).toEqual([{ role: "heading", name: "Title", level: 1 }]);
	});

	test("skips ignored nodes but promotes their children", () => {
		const nodes: CDPAXNode[] = [
			node({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				name: { type: "computedString", value: "" },
				childIds: ["2", "3"],
			}),
			node({
				nodeId: "2",
				ignored: true,
				role: { type: "role", value: "generic" },
				childIds: ["4"],
			}),
			node({
				nodeId: "4",
				role: { type: "role", value: "button" },
				name: { type: "computedString", value: "Nested" },
			}),
			node({
				nodeId: "3",
				role: { type: "role", value: "button" },
				name: { type: "computedString", value: "Visible" },
			}),
		];

		const result = buildTree(nodes);
		// The ignored node is skipped but its child is promoted to the top level.
		expect(result).toEqual([
			{ role: "button", name: "Nested" },
			{ role: "button", name: "Visible" },
		]);
	});

	test("excludes StaticText and InlineTextBox", () => {
		const nodes: CDPAXNode[] = [
			node({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				childIds: ["2"],
			}),
			node({
				nodeId: "2",
				role: { type: "role", value: "button" },
				name: { type: "computedString", value: "Click me" },
				childIds: ["3"],
			}),
			node({
				nodeId: "3",
				role: { type: "role", value: "StaticText" },
				name: { type: "computedString", value: "Click me" },
				childIds: ["4"],
			}),
			node({
				nodeId: "4",
				role: { type: "role", value: "InlineTextBox" },
				name: { type: "computedString", value: "Click me" },
			}),
		];

		const result = buildTree(nodes);
		expect(result).toEqual([{ role: "button", name: "Click me" }]);
	});

	test("aggregates StaticText into unnamed parent name", () => {
		const nodes: CDPAXNode[] = [
			node({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				childIds: ["2"],
			}),
			node({
				nodeId: "2",
				role: { type: "role", value: "paragraph" },
				name: { type: "computedString", value: "" },
				childIds: ["3"],
			}),
			node({
				nodeId: "3",
				role: { type: "role", value: "StaticText" },
				name: { type: "computedString", value: "Hello world" },
				childIds: ["4"],
			}),
			node({
				nodeId: "4",
				role: { type: "role", value: "InlineTextBox" },
				name: { type: "computedString", value: "Hello world" },
			}),
		];

		const result = buildTree(nodes);
		expect(result).toEqual([{ role: "paragraph", name: "Hello world" }]);
	});

	test("preserves generic containers", () => {
		const nodes: CDPAXNode[] = [
			node({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				childIds: ["2"],
			}),
			node({
				nodeId: "2",
				role: { type: "role", value: "generic" },
				name: { type: "computedString", value: "" },
				childIds: ["3"],
			}),
			node({
				nodeId: "3",
				role: { type: "role", value: "button" },
				name: { type: "computedString", value: "OK" },
			}),
		];

		const result = buildTree(nodes);
		expect(result).toEqual([
			{
				role: "generic",
				name: "",
				children: [{ role: "button", name: "OK" }],
			},
		]);
	});

	test("preserves landmark roles", () => {
		const nodes: CDPAXNode[] = [
			node({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				childIds: ["2", "3"],
			}),
			node({
				nodeId: "2",
				role: { type: "role", value: "navigation" },
				name: { type: "computedString", value: "Main" },
				childIds: ["4"],
			}),
			node({
				nodeId: "4",
				role: { type: "role", value: "link" },
				name: { type: "computedString", value: "Home" },
			}),
			node({
				nodeId: "3",
				role: { type: "role", value: "main" },
				name: { type: "computedString", value: "" },
				childIds: ["5"],
			}),
			node({
				nodeId: "5",
				role: { type: "role", value: "button" },
				name: { type: "computedString", value: "Submit" },
			}),
		];

		const result = buildTree(nodes);
		expect(result).toEqual([
			{
				role: "navigation",
				name: "Main",
				children: [{ role: "link", name: "Home" }],
			},
			{
				role: "main",
				name: "",
				children: [{ role: "button", name: "Submit" }],
			},
		]);
	});

	test("extracts level property for headings", () => {
		const nodes: CDPAXNode[] = [
			node({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				childIds: ["2"],
			}),
			node({
				nodeId: "2",
				role: { type: "role", value: "heading" },
				name: { type: "computedString", value: "Section" },
				properties: [{ name: "level", value: { type: "integer", value: 2 } }],
			}),
		];

		const result = buildTree(nodes);
		expect(result[0].level).toBe(2);
	});

	test("extracts value property for form controls", () => {
		const nodes: CDPAXNode[] = [
			node({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				childIds: ["2"],
			}),
			node({
				nodeId: "2",
				role: { type: "role", value: "textbox" },
				name: { type: "computedString", value: "Email" },
				properties: [
					{
						name: "value",
						value: { type: "string", value: "test@example.com" },
					},
				],
			}),
		];

		const result = buildTree(nodes);
		expect(result[0].value).toBe("test@example.com");
	});

	test("excludes none and presentation roles, promotes children", () => {
		const nodes: CDPAXNode[] = [
			node({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				childIds: ["2"],
			}),
			node({
				nodeId: "2",
				role: { type: "role", value: "none" },
				childIds: ["3"],
			}),
			node({
				nodeId: "3",
				role: { type: "role", value: "presentation" },
				childIds: ["4"],
			}),
			node({
				nodeId: "4",
				role: { type: "role", value: "link" },
				name: { type: "computedString", value: "Click" },
			}),
		];

		const result = buildTree(nodes);
		expect(result).toEqual([{ role: "link", name: "Click" }]);
	});

	test("builds deeply nested tree", () => {
		const nodes: CDPAXNode[] = [
			node({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				childIds: ["2"],
			}),
			node({
				nodeId: "2",
				role: { type: "role", value: "generic" },
				name: { type: "computedString", value: "" },
				childIds: ["3"],
			}),
			node({
				nodeId: "3",
				role: { type: "role", value: "generic" },
				name: { type: "computedString", value: "" },
				childIds: ["4"],
			}),
			node({
				nodeId: "4",
				role: { type: "role", value: "link" },
				name: { type: "computedString", value: "Deep" },
			}),
		];

		const result = buildTree(nodes);
		expect(result).toEqual([
			{
				role: "generic",
				name: "",
				children: [
					{
						role: "generic",
						name: "",
						children: [{ role: "link", name: "Deep" }],
					},
				],
			},
		]);
	});
});
