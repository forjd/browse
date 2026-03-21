import { describe, expect, mock, test } from "bun:test";
import {
	formatLinks,
	formatTable,
	handleExtract,
} from "../src/commands/extract.ts";

describe("formatTable", () => {
	test("formats as plain text table", () => {
		const output = formatTable(
			["Name", "Age"],
			[
				["Alice", "30"],
				["Bob", "25"],
			],
			false,
		);
		expect(output).toContain("Name");
		expect(output).toContain("Age");
		expect(output).toContain("Alice");
		expect(output).toContain("30");
		expect(output).toContain("---");
	});

	test("formats as CSV", () => {
		const output = formatTable(
			["Name", "Age"],
			[
				["Alice", "30"],
				["Bob", "25"],
			],
			true,
		);
		expect(output).toBe("Name,Age\nAlice,30\nBob,25");
	});

	test("escapes CSV values with commas", () => {
		const output = formatTable(["Name"], [["Smith, John"]], true);
		expect(output).toContain('"Smith, John"');
	});
});

describe("formatLinks", () => {
	test("formats links list", () => {
		const links = [
			{ href: "https://example.com", text: "Example" },
			{ href: "https://test.com", text: "Test" },
		];
		const output = formatLinks(links, null);
		expect(output).toContain("2 links found");
		expect(output).toContain("Example");
		expect(output).toContain("https://example.com");
	});

	test("filters links by pattern", () => {
		const links = [
			{ href: "https://example.com/about", text: "About" },
			{ href: "https://test.com/contact", text: "Contact" },
		];
		const output = formatLinks(links, "example");
		expect(output).toContain("1 link found");
		expect(output).toContain("About");
		expect(output).not.toContain("Contact");
	});

	test("shows message when no links match filter", () => {
		const links = [{ href: "https://example.com", text: "Example" }];
		const output = formatLinks(links, "nomatch");
		expect(output).toContain("No links matching");
	});

	test("shows message when no links found", () => {
		const output = formatLinks([], null);
		expect(output).toContain("No links found");
	});
});

describe("handleExtract", () => {
	test("shows usage when no subcommand", async () => {
		const page = {} as never;
		const result = await handleExtract(page, []);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage:");
		}
	});

	test("rejects unknown subcommand", async () => {
		const page = {} as never;
		const result = await handleExtract(page, ["unknown"]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown extract subcommand");
		}
	});

	test("extract table returns table data", async () => {
		const page = {
			evaluate: mock(() =>
				Promise.resolve({
					headers: ["Name", "Value"],
					rows: [
						["key1", "val1"],
						["key2", "val2"],
					],
				}),
			),
		} as never;

		const result = await handleExtract(page, ["table", "table.data"]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Name");
			expect(result.data).toContain("key1");
			expect(result.data).toContain("val2");
		}
	});

	test("extract table returns JSON when requested", async () => {
		const page = {
			evaluate: mock(() =>
				Promise.resolve({
					headers: ["Name", "Value"],
					rows: [["key1", "val1"]],
				}),
			),
		} as never;

		const result = await handleExtract(page, ["table"], { json: true });
		expect(result.ok).toBe(true);
		if (result.ok) {
			const parsed = JSON.parse(result.data);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].Name).toBe("key1");
		}
	});

	test("extract table returns error when no table found", async () => {
		const page = {
			evaluate: mock(() => Promise.resolve(null)),
		} as never;

		const result = await handleExtract(page, ["table", ".nonexistent"]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("No table found");
		}
	});

	test("extract links returns links", async () => {
		const page = {
			evaluate: mock(() =>
				Promise.resolve([
					{ href: "https://example.com", text: "Example" },
					{ href: "https://test.com", text: "Test" },
				]),
			),
		} as never;

		const result = await handleExtract(page, ["links"]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("2 links found");
		}
	});

	test("extract links filters with --filter", async () => {
		const page = {
			evaluate: mock(() =>
				Promise.resolve([
					{ href: "https://example.com", text: "Example" },
					{ href: "https://test.com", text: "Test" },
				]),
			),
		} as never;

		const result = await handleExtract(page, ["links", "--filter", "example"]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("1 link found");
		}
	});

	test("extract meta returns page metadata", async () => {
		const page = {
			evaluate: mock(() =>
				Promise.resolve({
					title: "Test Page",
					canonical: "https://example.com",
					meta: {
						description: "A test page",
						"og:title": "Test",
					},
					openGraph: { title: "Test" },
				}),
			),
		} as never;

		const result = await handleExtract(page, ["meta"]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Test Page");
			expect(result.data).toContain("Canonical");
			expect(result.data).toContain("description");
		}
	});

	test("extract select returns matching elements", async () => {
		const page = {
			evaluate: mock(() => Promise.resolve(["Item 1", "Item 2", "Item 3"])),
		} as never;

		const result = await handleExtract(page, ["select", ".item"]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("3 elements found");
			expect(result.data).toContain("Item 1");
		}
	});

	test("extract select returns attribute values with --attr", async () => {
		const page = {
			evaluate: mock(() => Promise.resolve(["/page1", "/page2"])),
		} as never;

		const result = await handleExtract(page, [
			"select",
			"a.nav",
			"--attr",
			"href",
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("/page1");
			expect(result.data).toContain("/page2");
		}
	});

	test("extract select shows usage without selector", async () => {
		const page = {} as never;
		const result = await handleExtract(page, ["select"]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage:");
		}
	});
});
