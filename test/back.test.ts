import { describe, expect, mock, test } from "bun:test";
import { handleBack } from "../src/commands/back.ts";

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
	cdpCurrentIndex = 1,
	cdpEntryCount = 2,
) {
	const cdpClient = mockCDPClient(cdpCurrentIndex, cdpEntryCount);
	return {
		goBack: mock(() => Promise.resolve({})),
		title: mock(() => Promise.resolve("Previous Page")),
		context: () => ({
			newCDPSession: mock(() => Promise.resolve(cdpClient)),
		}),
		...overrides,
		_cdpClient: cdpClient,
	};
}

describe("handleBack", () => {
	test("navigates back and returns page title", async () => {
		// currentIndex=1, 2 entries => back history exists
		const page = mockPage({}, 1, 2);
		const result = await handleBack(page as never);
		expect(result).toEqual({ ok: true, data: "Previous Page" });
		expect(page.goBack).toHaveBeenCalledWith({
			waitUntil: "domcontentloaded",
		});
	});

	test("returns error when no previous page in history", async () => {
		// currentIndex=0, 1 entry => no back history
		const page = mockPage({}, 0, 1);
		const result = await handleBack(page as never);
		expect(result).toEqual({
			ok: false,
			error: "No previous page in history",
		});
		// Should NOT have called goBack since CDP says no history
		expect(page.goBack).not.toHaveBeenCalled();
	});

	test("returns error when goBack throws", async () => {
		// Has back history but goBack throws
		const page = mockPage(
			{
				goBack: mock(() => Promise.reject(new Error("Navigation failed"))),
			},
			1,
			2,
		);
		const result = await handleBack(page as never);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Navigation failed");
		}
	});

	test("detaches CDP session after history check", async () => {
		const page = mockPage({}, 0, 1);
		await handleBack(page as never);
		expect(page._cdpClient.detach).toHaveBeenCalled();
	});
});
