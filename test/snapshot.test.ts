import { describe, expect, mock, test } from "bun:test";
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

	test("includes all nodes in -f mode", async () => {
		clearRefs();
		const page = mockPage(
			`- navigation "Main":\n  - link "Home"\n- generic: stuff`,
		);

		const result = await handleSnapshot(page, ["-f"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("navigation");
			expect(result.data).toContain("generic");
			expect(result.data).toContain('@e1 [link] "Home"');
		}
	});

	test("indents nested elements", async () => {
		clearRefs();
		const page = mockPage(
			`- navigation "Nav":\n  - link "Home"\n  - link "About"`,
		);

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
