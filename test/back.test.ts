import { describe, expect, mock, test } from "bun:test";
import { handleBack } from "../src/commands/back.ts";

function mockPage(overrides: Record<string, unknown> = {}) {
	return {
		goBack: mock(() => Promise.resolve({})),
		title: mock(() => Promise.resolve("Previous Page")),
		...overrides,
	};
}

describe("handleBack", () => {
	test("navigates back and returns page title", async () => {
		const page = mockPage();
		const result = await handleBack(page as never);
		expect(result).toEqual({ ok: true, data: "Previous Page" });
		expect(page.goBack).toHaveBeenCalledWith({
			waitUntil: "domcontentloaded",
		});
	});

	test("returns error when no previous page in history", async () => {
		const page = mockPage({
			goBack: mock(() => Promise.resolve(null)),
		});
		const result = await handleBack(page as never);
		expect(result).toEqual({
			ok: false,
			error: "No previous page in history",
		});
	});

	test("returns error when goBack throws", async () => {
		const page = mockPage({
			goBack: mock(() => Promise.reject(new Error("Navigation failed"))),
		});
		const result = await handleBack(page as never);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Navigation failed");
		}
	});
});
