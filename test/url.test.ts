import { describe, expect, mock, test } from "bun:test";
import { handleUrl } from "../src/commands/url.ts";

function mockPage(overrides: Record<string, unknown> = {}) {
	return {
		url: mock(() => "https://example.com/dashboard"),
		...overrides,
	};
}

describe("handleUrl", () => {
	test("returns the current page URL", async () => {
		const page = mockPage();
		const result = await handleUrl(page as never);
		expect(result).toEqual({
			ok: true,
			data: "https://example.com/dashboard",
		});
	});

	test("returns error when page.url() throws", async () => {
		const page = mockPage({
			url: mock(() => {
				throw new Error("Page crashed");
			}),
		});
		const result = await handleUrl(page as never);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Page crashed");
		}
	});
});
