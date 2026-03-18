import { describe, expect, mock, test } from "bun:test";
import type { CDPAXNode } from "../src/cdp-accessibility.ts";
import { handleSnapshot } from "../src/commands/snapshot.ts";
import { clearRefs, getRefs } from "../src/refs.ts";

function mockPage(ariaOutput: string) {
	return {
		locator: mock((_selector: string) => ({
			ariaSnapshot: mock(() => Promise.resolve(ariaOutput)),
		})),
		title: mock(() => Promise.resolve("Test Page")),
	} as never;
}

/** Mock page that provides CDP session for -f mode. */
function mockPageWithCDP(cdpNodes: CDPAXNode[]) {
	const mockClient = {
		send: mock((_method: string) => Promise.resolve({ nodes: cdpNodes })),
		detach: mock(() => Promise.resolve()),
	};
	const mockContext = {
		newCDPSession: mock(() => Promise.resolve(mockClient)),
	};
	return {
		context: mock(() => mockContext),
		title: mock(() => Promise.resolve("Test Page")),
		_mockClient: mockClient,
	} as never;
}

function cdpNode(
	overrides: Partial<CDPAXNode> & { nodeId: string },
): CDPAXNode {
	return { ignored: false, ...overrides };
}

describe("handleSnapshot", () => {
	test("returns interactive elements with refs in default mode", async () => {
		clearRefs();
		const page = mockPage(
			`- link "Home"\n- button "Submit"\n- textbox "Email"`,
		);

		const result = await handleSnapshot(page, []);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain('@e1 [link] "Home"');
			expect(result.data).toContain('@e2 [button] "Submit"');
			expect(result.data).toContain('@e3 [textbox] "Email"');
			expect(result.data).toContain('[page] "Test Page"');
		}
	});

	test("skips non-interactive elements in default mode", async () => {
		clearRefs();
		const page = mockPage(
			`- heading "Title" [level=1]\n- paragraph: Some text\n- button "OK"`,
		);

		const result = await handleSnapshot(page, []);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).not.toContain("heading");
			expect(result.data).not.toContain("paragraph");
			expect(result.data).toContain('@e1 [button] "OK"');
		}
	});

	test("includes structural elements without refs in -i mode", async () => {
		clearRefs();
		const page = mockPage(
			`- heading "Dashboard" [level=1]\n- paragraph: Welcome back.\n- button "Create"`,
		);

		const result = await handleSnapshot(page, ["-i"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain('[heading, level=1] "Dashboard"');
			expect(result.data).toContain('[paragraph] "Welcome back."');
			expect(result.data).toContain('@e1 [button] "Create"');
		}
	});

	test("includes all nodes in -f mode via CDP", async () => {
		clearRefs();
		const page = mockPageWithCDP([
			cdpNode({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				name: { type: "computedString", value: "Test Page" },
				childIds: ["2", "3"],
			}),
			cdpNode({
				nodeId: "2",
				role: { type: "role", value: "navigation" },
				name: { type: "computedString", value: "Main" },
				childIds: ["4"],
			}),
			cdpNode({
				nodeId: "4",
				role: { type: "role", value: "link" },
				name: { type: "computedString", value: "Home" },
			}),
			cdpNode({
				nodeId: "3",
				role: { type: "role", value: "generic" },
				name: { type: "computedString", value: "stuff" },
			}),
		]);

		const result = await handleSnapshot(page, ["-f"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("navigation");
			expect(result.data).toContain("generic");
			expect(result.data).toContain('@e1 [link] "Home"');
		}
	});

	test("indents nested elements in -f mode", async () => {
		clearRefs();
		const page = mockPageWithCDP([
			cdpNode({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				childIds: ["2"],
			}),
			cdpNode({
				nodeId: "2",
				role: { type: "role", value: "navigation" },
				name: { type: "computedString", value: "Nav" },
				childIds: ["3", "4"],
			}),
			cdpNode({
				nodeId: "3",
				role: { type: "role", value: "link" },
				name: { type: "computedString", value: "Home" },
			}),
			cdpNode({
				nodeId: "4",
				role: { type: "role", value: "link" },
				name: { type: "computedString", value: "About" },
			}),
		]);

		const result = await handleSnapshot(page, ["-f"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			const lines = result.data.split("\n");
			const homeLine = lines.find((l: string) => l.includes("Home"));
			expect(homeLine).toMatch(/^\s{2,}/);
		}
	});

	test("populates ref registry", async () => {
		clearRefs();
		const page = mockPage(`- button "Save"\n- link "Cancel"`);

		await handleSnapshot(page, []);

		const refs = getRefs();
		expect(refs.size).toBe(2);
		expect(refs.get("@e1")?.name).toBe("Save");
		expect(refs.get("@e2")?.name).toBe("Cancel");
	});

	test("shows duplicate indicators", async () => {
		clearRefs();
		const page = mockPage(
			`- button "Delete"\n- button "Delete"\n- button "Delete"`,
		);

		const result = await handleSnapshot(page, []);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("1 of 3");
			expect(result.data).toContain("2 of 3");
			expect(result.data).toContain("3 of 3");
		}
	});

	test("truncates output exceeding 10,000 characters", async () => {
		clearRefs();
		const lines = Array.from(
			{ length: 500 },
			(_, i) => `- button "Button with a reasonably long name number ${i + 1}"`,
		).join("\n");

		const page = mockPage(lines);

		const result = await handleSnapshot(page, []);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.length).toBeLessThanOrEqual(10_200);
			expect(result.data).toContain("more elements");
		}
	});

	test("skips unnamed elements in default mode", async () => {
		clearRefs();
		const page = mockPage(`- button ""\n- button "Valid"`);

		const result = await handleSnapshot(page, []);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Valid");
			// The unnamed button should not appear
			const buttonLines = result.data
				.split("\n")
				.filter((l: string) => l.includes("[button]"));
			expect(buttonLines.length).toBe(1);
		}
	});

	test("returns JSON when json option is true", async () => {
		clearRefs();
		const page = mockPage(
			`- link "Home"\n- button "Submit"\n- textbox "Email"`,
		);

		const result = await handleSnapshot(page, [], { json: true });

		expect(result.ok).toBe(true);
		if (result.ok) {
			const parsed = JSON.parse(result.data);
			expect(parsed.title).toBe("Test Page");
			expect(Array.isArray(parsed.nodes)).toBe(true);
			expect(parsed.nodes.length).toBeGreaterThan(0);
		}
	});

	test("returns JSON with mode flags", async () => {
		clearRefs();
		const page = mockPage(`- heading "Title" [level=1]\n- button "OK"`);

		const result = await handleSnapshot(page, ["-i"], { json: true });

		expect(result.ok).toBe(true);
		if (result.ok) {
			const parsed = JSON.parse(result.data);
			expect(parsed.title).toBe("Test Page");
			expect(Array.isArray(parsed.nodes)).toBe(true);
		}
	});

	test("-f (CDP) includes generic containers that -i excludes", async () => {
		clearRefs();

		// CDP tree for -f: includes generic containers wrapping everything
		const cdpPage = mockPageWithCDP([
			cdpNode({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				childIds: ["2"],
			}),
			cdpNode({
				nodeId: "2",
				role: { type: "role", value: "generic" },
				name: { type: "computedString", value: "" },
				childIds: ["3", "4"],
			}),
			cdpNode({
				nodeId: "3",
				role: { type: "role", value: "heading" },
				name: { type: "computedString", value: "Welcome" },
				properties: [{ name: "level", value: { type: "integer", value: 1 } }],
			}),
			cdpNode({
				nodeId: "4",
				role: { type: "role", value: "button" },
				name: { type: "computedString", value: "Submit" },
			}),
		]);

		// Playwright ariaSnapshot for -i: same page but no generic container
		const ariaPage = mockPage(
			'- heading "Welcome" [level=1]\n- button "Submit"',
		);

		const fullResult = await handleSnapshot(cdpPage, ["-f"]);
		const inclusiveResult = await handleSnapshot(ariaPage, ["-i"]);

		expect(fullResult.ok).toBe(true);
		expect(inclusiveResult.ok).toBe(true);
		if (!fullResult.ok || !inclusiveResult.ok) return;

		// Full mode shows the generic container
		expect(fullResult.data).toContain("[generic]");
		expect(inclusiveResult.data).not.toContain("generic");

		// Both include the heading and button
		expect(fullResult.data).toContain('[heading, level=1] "Welcome"');
		expect(inclusiveResult.data).toContain('[heading, level=1] "Welcome"');
		expect(fullResult.data).toContain('@e1 [button] "Submit"');
		expect(inclusiveResult.data).toContain('@e1 [button] "Submit"');

		// Outputs must differ
		expect(fullResult.data).not.toBe(inclusiveResult.data);
	});

	test("-f detaches CDP session", async () => {
		clearRefs();
		const page = mockPageWithCDP([
			cdpNode({
				nodeId: "1",
				role: { type: "role", value: "RootWebArea" },
				childIds: [],
			}),
		]);

		await handleSnapshot(page, ["-f"]);

		// Verify session was detached
		const ctx = (
			page as unknown as { _mockClient: { detach: ReturnType<typeof mock> } }
		)._mockClient;
		expect(ctx.detach).toHaveBeenCalled();
	});

	test("-f handles malformed CDP response gracefully", async () => {
		clearRefs();
		const mockClient = {
			send: mock(() => Promise.resolve({ unexpected: "shape" })),
			detach: mock(() => Promise.resolve()),
		};
		const page = {
			context: mock(() => ({
				newCDPSession: mock(() => Promise.resolve(mockClient)),
			})),
			title: mock(() => Promise.resolve("Test Page")),
		} as never;

		const result = await handleSnapshot(page, ["-f"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			// Should return just the page header with no nodes
			expect(result.data).toBe('[page] "Test Page"');
		}
		expect(mockClient.detach).toHaveBeenCalled();
	});

	test("returns error when ariaSnapshot fails", async () => {
		clearRefs();
		const page = {
			locator: mock((_s: string) => ({
				ariaSnapshot: mock(() =>
					Promise.reject(new Error("Accessibility not available")),
				),
			})),
			title: mock(() => Promise.resolve("Test")),
		} as never;

		const result = await handleSnapshot(page, []);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Accessibility not available");
		}
	});
});
