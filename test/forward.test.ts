import { describe, expect, mock, test } from "bun:test";
import { handleForward } from "../src/commands/forward.ts";

function mockPage(overrides: Record<string, unknown> = {}) {
	return {
		goForward: mock(() => Promise.resolve({})),
		title: mock(() => Promise.resolve("Next Page")),
		...overrides,
	};
}

describe("handleForward", () => {
	test("navigates forward and returns page title", async () => {
		const page = mockPage();
		const result = await handleForward(page as never);
		expect(result).toEqual({ ok: true, data: "Next Page" });
		expect(page.goForward).toHaveBeenCalledWith({
			waitUntil: "domcontentloaded",
		});
	});

	test("returns error when no next page in history", async () => {
		const page = mockPage({
			goForward: mock(() => Promise.resolve(null)),
		});
		const result = await handleForward(page as never);
		expect(result).toEqual({
			ok: false,
			error: "No next page in history",
		});
	});

	test("returns error when goForward throws", async () => {
		const page = mockPage({
			goForward: mock(() => Promise.reject(new Error("Navigation failed"))),
		});
		const result = await handleForward(page as never);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Navigation failed");
		}
	});
});
