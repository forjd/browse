import { describe, expect, mock, test } from "bun:test";
import { handleForward } from "../src/commands/forward.ts";

function mockCDPClient(currentIndex: number, entryCount: number) {
	return {
		send: mock((_method: string) =>
			Promise.resolve({
				currentIndex,
				entries: Array.from({ length: entryCount }, (_, i) => ({ id: i })),
			}),
		),
		detach: mock(() => Promise.resolve()),
	};
}

function mockPage(
	overrides: Record<string, unknown> = {},
	cdpCurrentIndex = 0,
	cdpEntryCount = 1,
) {
	const cdpClient = mockCDPClient(cdpCurrentIndex, cdpEntryCount);
	return {
		goForward: mock(() => Promise.resolve({})),
		title: mock(() => Promise.resolve("Next Page")),
		context: () => ({
			newCDPSession: mock(() => Promise.resolve(cdpClient)),
		}),
		...overrides,
		_cdpClient: cdpClient,
	};
}

describe("handleForward", () => {
	test("navigates forward and returns page title", async () => {
		// currentIndex=0, 2 entries => forward history exists
		const page = mockPage({}, 0, 2);
		const result = await handleForward(page as never);
		expect(result).toEqual({ ok: true, data: "Next Page" });
		expect(page.goForward).toHaveBeenCalledWith({
			waitUntil: "domcontentloaded",
		});
	});

	test("returns error when no next page in history", async () => {
		// currentIndex=0, 1 entry => no forward history (already at end)
		const page = mockPage({}, 0, 1);
		const result = await handleForward(page as never);
		expect(result).toEqual({
			ok: false,
			error: "No next page in history",
		});
		// Should NOT have called goForward since CDP says no history
		expect(page.goForward).not.toHaveBeenCalled();
	});

	test("returns error when goForward throws", async () => {
		// Has forward history but goForward throws
		const page = mockPage(
			{
				goForward: mock(() => Promise.reject(new Error("Navigation failed"))),
			},
			0,
			2,
		);
		const result = await handleForward(page as never);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Navigation failed");
		}
	});

	test("detaches CDP session after history check", async () => {
		const page = mockPage({}, 0, 1);
		await handleForward(page as never);
		expect(page._cdpClient.detach).toHaveBeenCalled();
	});

	test("detaches CDP session even when client.send rejects", async () => {
		const cdpClient = {
			send: mock(() => Promise.reject(new Error("CDP failure"))),
			detach: mock(() => Promise.resolve()),
		};
		const page = {
			goForward: mock(() => Promise.resolve({})),
			title: mock(() => Promise.resolve("Next Page")),
			context: () => ({
				newCDPSession: mock(() => Promise.resolve(cdpClient)),
			}),
		};
		const result = await handleForward(page as never);
		expect(result).toEqual({ ok: false, error: "CDP failure" });
		expect(cdpClient.detach).toHaveBeenCalled();
	});
});
