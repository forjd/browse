import { describe, expect, mock, test } from "bun:test";
import { handleWipe, type WipeDeps } from "../../src/commands/wipe.ts";

type MockPage = ReturnType<typeof mockPage>;

function mockPage(overrides: Record<string, unknown> = {}) {
	return {
		url: mock(() => "https://b.example/"),
		goto: mock(() => Promise.resolve()),
		evaluate: mock(() => Promise.resolve()),
		route: mock(() => Promise.resolve()),
		unroute: mock(() => Promise.resolve()),
		close: mock(() => Promise.resolve()),
		...overrides,
	};
}

/** Origins as `context.storageState()` reports them: those holding localStorage. */
function storedOrigins(...origins: string[]) {
	return mock(() =>
		Promise.resolve({
			cookies: [],
			origins: origins.map((origin) => ({ origin, localStorage: [] })),
		}),
	);
}

function mockContext(overrides: Record<string, unknown> = {}) {
	return {
		clearCookies: mock(() => Promise.resolve()),
		storageState: storedOrigins(),
		...overrides,
	};
}

function mockTabRegistry(...pages: MockPage[]) {
	return {
		tabs: pages.map((page) => ({
			page,
			consoleBuffer: { clear: mock(() => {}) },
			networkBuffer: { clear: mock(() => {}) },
		})),
		activeTabIndex: 0,
	};
}

function makeMockDeps(overrides: Partial<WipeDeps> = {}): WipeDeps {
	const page = mockPage();

	return {
		context: mockContext() as never,
		tabRegistry: mockTabRegistry(page) as never,
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
		const extraPage = mockPage();
		const registry = mockTabRegistry(mockPage(), extraPage);
		registry.activeTabIndex = 1;
		const deps = makeMockDeps({ tabRegistry: registry as never });

		await handleWipe(deps);

		expect(extraPage.close).toHaveBeenCalled();
		expect(deps.tabRegistry.tabs.length).toBe(1);
		expect(deps.tabRegistry.activeTabIndex).toBe(0);
	});

	test("reports partial success if clearing storage fails", async () => {
		const page = mockPage({
			evaluate: mock(() => Promise.reject(new Error("storage error"))),
		});
		const deps = makeMockDeps({ tabRegistry: mockTabRegistry(page) as never });

		const result = await handleWipe(deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Session wiped (with warnings)");
			expect(result.data).toContain("storage error");
		}
	});

	test("reports partial success if clearing cookies fails", async () => {
		const deps = makeMockDeps({
			context: mockContext({
				clearCookies: mock(() => Promise.reject(new Error("cookie error"))),
			}) as never,
		});

		const result = await handleWipe(deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Session wiped (with warnings)");
			expect(result.data).toContain("cookie error");
		}
	});

	test("reports warning when closing an extra tab throws", async () => {
		const failingPage = mockPage({
			close: mock(() => Promise.reject(new Error("tab close error"))),
		});
		const registry = mockTabRegistry(mockPage(), failingPage);
		registry.activeTabIndex = 1;
		const deps = makeMockDeps({ tabRegistry: registry as never });

		const result = await handleWipe(deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Session wiped (with warnings)");
			expect(result.data).toContain("Failed to close tab");
			expect(result.data).toContain("tab close error");
		}
		// Should still continue — only the primary tab remains
		expect(deps.tabRegistry.tabs.length).toBe(1);
	});

	test("reports warning when navigating to about:blank throws", async () => {
		const page = mockPage({
			goto: mock(() => Promise.reject(new Error("navigation failed"))),
		});
		const deps = makeMockDeps({ tabRegistry: mockTabRegistry(page) as never });

		const result = await handleWipe(deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Session wiped (with warnings)");
			expect(result.data).toContain("Failed to navigate to about:blank");
			expect(result.data).toContain("navigation failed");
		}
	});
});

describe("handleWipe across origins", () => {
	function cdpDeps(...origins: string[]) {
		const send = mock(() => Promise.resolve());
		const detach = mock(() => Promise.resolve());
		const page = mockPage();
		const deps = makeMockDeps({
			context: mockContext({
				storageState: storedOrigins(...origins),
				newCDPSession: mock(() => Promise.resolve({ send, detach })),
			}) as never,
			tabRegistry: mockTabRegistry(page) as never,
		});
		return { deps, page, send, detach };
	}

	test("clears every stored origin over CDP, not just the active one", async () => {
		const { deps, send } = cdpDeps("https://a.example", "https://b.example");

		const result = await handleWipe(deps);

		expect(result).toEqual({ ok: true, data: "Session wiped." });
		// b.example is the tab's own origin and was already cleared in place.
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith("Storage.clearDataForOrigin", {
			origin: "https://a.example",
			storageTypes: "all",
		});
	});

	test("detaches the CDP session when done", async () => {
		const { deps, detach } = cdpDeps("https://a.example");

		await handleWipe(deps);

		expect(detach).toHaveBeenCalled();
	});

	test("skips CDP entirely when there are no other origins", async () => {
		const { deps, send } = cdpDeps("https://b.example");

		await handleWipe(deps);

		expect(send).not.toHaveBeenCalled();
	});

	test("warns but continues when one origin fails to clear", async () => {
		const { deps, send } = cdpDeps("https://a.example", "https://c.example");
		send.mockImplementation(((_method: string, params: { origin: string }) =>
			params.origin === "https://a.example"
				? Promise.reject(new Error("clear failed"))
				: Promise.resolve()) as never);

		const result = await handleWipe(deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain(
				"Failed to clear storage for https://a.example",
			);
			expect(result.data).toContain("clear failed");
		}
		// The failure must not stop the remaining origin from being cleared.
		expect(send).toHaveBeenCalledTimes(2);
	});

	test("visits other origins when the browser has no CDP", async () => {
		const page = mockPage();
		const deps = makeMockDeps({
			context: mockContext({
				storageState: storedOrigins("https://a.example", "https://b.example"),
			}) as never,
			tabRegistry: mockTabRegistry(page) as never,
		});

		const result = await handleWipe(deps);

		expect(result).toEqual({ ok: true, data: "Session wiped." });
		expect(page.goto).toHaveBeenCalledWith("https://a.example/");
		expect(page.goto).not.toHaveBeenCalledWith("https://b.example/");
		expect(page.route).toHaveBeenCalledTimes(1);
		expect(page.unroute).toHaveBeenCalledTimes(1);
		// Once for the tab's own origin, once for the origin it visited.
		expect(page.evaluate).toHaveBeenCalledTimes(2);
	});

	test("unroutes the interceptor even when the visit fails", async () => {
		const page = mockPage({
			goto: mock((url: string) =>
				url === "about:blank"
					? Promise.resolve()
					: Promise.reject(new Error("unreachable")),
			),
		});
		const deps = makeMockDeps({
			context: mockContext({
				storageState: storedOrigins("https://a.example"),
			}) as never,
			tabRegistry: mockTabRegistry(page) as never,
		});

		const result = await handleWipe(deps);

		expect(page.unroute).toHaveBeenCalledTimes(1);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain(
				"Failed to clear storage for https://a.example",
			);
		}
	});

	test("treats an opaque active origin as no origin to skip", async () => {
		const page = mockPage({ url: mock(() => "about:blank") });
		const { send } = { send: mock(() => Promise.resolve()) };
		const deps = makeMockDeps({
			context: mockContext({
				storageState: storedOrigins("https://a.example"),
				newCDPSession: mock(() =>
					Promise.resolve({ send, detach: mock(() => Promise.resolve()) }),
				),
			}) as never,
			tabRegistry: mockTabRegistry(page) as never,
		});

		await handleWipe(deps);

		expect(send).toHaveBeenCalledWith("Storage.clearDataForOrigin", {
			origin: "https://a.example",
			storageTypes: "all",
		});
	});

	test("warns when the origin list cannot be read", async () => {
		const deps = makeMockDeps({
			context: mockContext({
				storageState: mock(() => Promise.reject(new Error("state error"))),
			}) as never,
		});

		const result = await handleWipe(deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Failed to list stored origins");
			expect(result.data).toContain("state error");
		}
	});
});
