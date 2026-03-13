import { describe, expect, mock, test } from "bun:test";
import { handleReload } from "../src/commands/reload.ts";

function mockPage(overrides: Record<string, unknown> = {}) {
	const mockClient = {
		send: mock(() => Promise.resolve()),
		detach: mock(() => Promise.resolve()),
	};
	const mockContext = {
		newCDPSession: mock(() => Promise.resolve(mockClient)),
	};
	return {
		reload: mock(() => Promise.resolve()),
		title: mock(() => Promise.resolve("Reloaded Page")),
		context: mock(() => mockContext),
		_mockClient: mockClient,
		_mockContext: mockContext,
		...overrides,
	};
}

describe("handleReload", () => {
	test("reloads the page and returns title", async () => {
		const page = mockPage();
		const result = await handleReload(page as never, []);
		expect(result).toEqual({ ok: true, data: "Reloaded Page" });
		expect(page.reload).toHaveBeenCalledWith({
			waitUntil: "domcontentloaded",
		});
	});

	test("clears cache before reloading with --hard", async () => {
		const page = mockPage();
		const result = await handleReload(page as never, ["--hard"]);
		expect(result).toEqual({ ok: true, data: "Reloaded Page" });
		expect(page._mockClient.send).toHaveBeenCalledWith(
			"Network.clearBrowserCache",
		);
		expect(page._mockClient.detach).toHaveBeenCalled();
		expect(page.reload).toHaveBeenCalledWith({
			waitUntil: "domcontentloaded",
		});
	});

	test("returns error when reload throws", async () => {
		const page = mockPage({
			reload: mock(() => Promise.reject(new Error("Page crashed"))),
		});
		const result = await handleReload(page as never, []);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Page crashed");
		}
	});
});
