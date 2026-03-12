import { describe, expect, mock, test } from "bun:test";
import { handleWipe, type WipeDeps } from "../../src/commands/wipe.ts";

function makeMockDeps(overrides: Partial<WipeDeps> = {}): WipeDeps {
	const mockPage = {
		goto: mock(() => Promise.resolve()),
		evaluate: mock(() => Promise.resolve()),
		close: mock(() => Promise.resolve()),
	};

	return {
		context: {
			clearCookies: mock(() => Promise.resolve()),
			pages: mock(() => [mockPage]),
		} as never,
		tabRegistry: {
			tabs: [
				{
					page: mockPage as never,
					consoleBuffer: { clear: mock(() => {}) },
					networkBuffer: { clear: mock(() => {}) },
				},
			],
			activeTabIndex: 0,
		} as never,
		clearRefs: mock(() => {}),
		...overrides,
	};
}

describe("handleWipe", () => {
	test("returns success message on clean wipe", async () => {
		const deps = makeMockDeps();
		const result = await handleWipe(deps);

		expect(result).toEqual({ ok: true, data: "Session wiped." });
	});

	test("clears cookies", async () => {
		const deps = makeMockDeps();
		await handleWipe(deps);

		expect(deps.context.clearCookies).toHaveBeenCalled();
	});

	test("navigates remaining tab to about:blank", async () => {
		const deps = makeMockDeps();
		await handleWipe(deps);

		const page = deps.tabRegistry.tabs[0].page;
		expect(page.goto).toHaveBeenCalledWith("about:blank");
	});

	test("clears localStorage and sessionStorage via evaluate", async () => {
		const deps = makeMockDeps();
		await handleWipe(deps);

		const page = deps.tabRegistry.tabs[0].page;
		expect(page.evaluate).toHaveBeenCalled();
	});

	test("clears console and network buffers", async () => {
		const deps = makeMockDeps();
		await handleWipe(deps);

		expect(deps.tabRegistry.tabs[0].consoleBuffer.clear).toHaveBeenCalled();
		expect(deps.tabRegistry.tabs[0].networkBuffer.clear).toHaveBeenCalled();
	});

	test("invalidates refs", async () => {
		const deps = makeMockDeps();
		await handleWipe(deps);

		expect(deps.clearRefs).toHaveBeenCalled();
	});

	test("closes extra tabs, keeps one", async () => {
		const extraPage = {
			goto: mock(() => Promise.resolve()),
			evaluate: mock(() => Promise.resolve()),
			close: mock(() => Promise.resolve()),
		};
		const deps = makeMockDeps({
			tabRegistry: {
				tabs: [
					{
						page: {
							goto: mock(() => Promise.resolve()),
							evaluate: mock(() => Promise.resolve()),
							close: mock(() => Promise.resolve()),
						} as never,
						consoleBuffer: { clear: mock(() => {}) },
						networkBuffer: { clear: mock(() => {}) },
					},
					{
						page: extraPage as never,
						consoleBuffer: { clear: mock(() => {}) },
						networkBuffer: { clear: mock(() => {}) },
					},
				],
				activeTabIndex: 1,
			} as never,
		});

		await handleWipe(deps);

		expect(extraPage.close).toHaveBeenCalled();
		expect(deps.tabRegistry.tabs.length).toBe(1);
		expect(deps.tabRegistry.activeTabIndex).toBe(0);
	});

	test("reports partial success if clearing storage fails", async () => {
		const mockPage = {
			goto: mock(() => Promise.resolve()),
			evaluate: mock(() => Promise.reject(new Error("storage error"))),
			close: mock(() => Promise.resolve()),
		};

		const deps = makeMockDeps({
			context: {
				clearCookies: mock(() => Promise.resolve()),
				pages: mock(() => [mockPage]),
			} as never,
			tabRegistry: {
				tabs: [
					{
						page: mockPage as never,
						consoleBuffer: { clear: mock(() => {}) },
						networkBuffer: { clear: mock(() => {}) },
					},
				],
				activeTabIndex: 0,
			} as never,
		});

		const result = await handleWipe(deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Session wiped (with warnings)");
			expect(result.data).toContain("storage error");
		}
	});

	test("reports partial success if clearing cookies fails", async () => {
		const deps = makeMockDeps({
			context: {
				clearCookies: mock(() => Promise.reject(new Error("cookie error"))),
				pages: mock(() => []),
			} as never,
		});

		const result = await handleWipe(deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Session wiped (with warnings)");
			expect(result.data).toContain("cookie error");
		}
	});
});
