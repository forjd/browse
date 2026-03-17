import { describe, expect, mock, test } from "bun:test";
import { handleStorage } from "../src/commands/storage.ts";

function mockPage(entries: Record<string, string> = {}) {
	return {
		evaluate: mock(
			(_fn: (type: string) => Record<string, string>, _type: string) =>
				Promise.resolve(entries),
		),
	} as never;
}

describe("storage --json", () => {
	test("returns JSON object of entries when json is true", async () => {
		const page = mockPage({ theme: "dark", lang: "en" });

		const res = await handleStorage(page, ["local"], { json: true });
		expect(res.ok).toBe(true);
		if (res.ok) {
			const parsed = JSON.parse(res.data);
			expect(parsed).toEqual({ theme: "dark", lang: "en" });
		}
	});

	test("returns empty JSON object when no entries and json is true", async () => {
		const page = mockPage({});

		const res = await handleStorage(page, ["local"], { json: true });
		expect(res.ok).toBe(true);
		if (res.ok) {
			const parsed = JSON.parse(res.data);
			expect(parsed).toEqual({});
		}
	});

	test("still requires subcommand even with json", async () => {
		const page = mockPage();

		const res = await handleStorage(page, [], { json: true });
		expect(res.ok).toBe(false);
	});
});
