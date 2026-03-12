import { describe, expect, mock, test } from "bun:test";
import { handleTab, type TabRegistry } from "../src/commands/tab.ts";

function mockPage(overrides: Record<string, unknown> = {}) {
	return {
		url: mock(() => "https://example.com"),
		title: mock(() => Promise.resolve("Example Page")),
		close: mock(() => Promise.resolve()),
		bringToFront: mock(() => Promise.resolve()),
		goto: mock(() => Promise.resolve()),
		on: mock(() => {}),
		...overrides,
	} as never;
}

function createRegistry(pageCount = 1): TabRegistry {
	const pages = Array.from({ length: pageCount }, (_, i) =>
		mockPage({
			url: mock(() => `https://example.com/page${i + 1}`),
			title: mock(() => Promise.resolve(`Page ${i + 1}`)),
		}),
	);
	return {
		tabs: pages.map((page) => ({
			page,
			consoleBuffer: {
				push: mock(() => {}),
				drain: mock(() => []),
				peek: mock(() => []),
				clear: mock(() => {}),
			} as never,
			networkBuffer: {
				push: mock(() => {}),
				drain: mock(() => []),
				peek: mock(() => []),
				clear: mock(() => {}),
			} as never,
		})),
		activeTabIndex: 0,
	};
}

describe("tab command", () => {
	test("returns error when no subcommand provided", async () => {
		const registry = createRegistry();
		const res = await handleTab(registry, [], {
			clearRefs: mock(() => {}),
			createTab: mock(() => Promise.resolve(registry.tabs[0])),
		});
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("list");
			expect(res.error).toContain("new");
			expect(res.error).toContain("switch");
			expect(res.error).toContain("close");
		}
	});

	test("returns error for unknown subcommand", async () => {
		const registry = createRegistry();
		const res = await handleTab(registry, ["dance"], {
			clearRefs: mock(() => {}),
			createTab: mock(() => Promise.resolve(registry.tabs[0])),
		});
		expect(res.ok).toBe(false);
	});

	describe("list", () => {
		test("lists single tab marked as active", async () => {
			const registry = createRegistry(1);
			const res = await handleTab(registry, ["list"], {
				clearRefs: mock(() => {}),
				createTab: mock(() => Promise.resolve(registry.tabs[0])),
			});
			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.data).toContain("[active]");
				expect(res.data).toContain("1.");
			}
		});

		test("lists multiple tabs with active marker on correct tab", async () => {
			const registry = createRegistry(3);
			registry.activeTabIndex = 1;

			const res = await handleTab(registry, ["list"], {
				clearRefs: mock(() => {}),
				createTab: mock(() => Promise.resolve(registry.tabs[0])),
			});
			expect(res.ok).toBe(true);
			if (res.ok) {
				const lines = res.data.split("\n");
				expect(lines[0]).not.toContain("[active]");
				expect(lines[1]).toContain("[active]");
				expect(lines[2]).not.toContain("[active]");
			}
		});
	});

	describe("new", () => {
		test("opens a blank tab and switches to it", async () => {
			const registry = createRegistry(1);
			const newPage = mockPage({
				url: mock(() => "about:blank"),
				title: mock(() => Promise.resolve("")),
			});
			const newTabState = {
				page: newPage,
				consoleBuffer: {
					push: mock(() => {}),
					drain: mock(() => []),
					peek: mock(() => []),
					clear: mock(() => {}),
				} as never,
				networkBuffer: {
					push: mock(() => {}),
					drain: mock(() => []),
					peek: mock(() => []),
					clear: mock(() => {}),
				} as never,
			};
			const clearRefs = mock(() => {});
			const createTab = mock(() => Promise.resolve(newTabState));

			const res = await handleTab(registry, ["new"], { clearRefs, createTab });
			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.data).toContain("tab 2");
				expect(res.data).toContain("blank");
			}
			expect(registry.tabs).toHaveLength(2);
			expect(registry.activeTabIndex).toBe(1);
			expect(clearRefs).toHaveBeenCalled();
		});

		test("opens a tab with URL and navigates", async () => {
			const registry = createRegistry(1);
			const newPage = mockPage({
				url: mock(() => "https://example.com/new"),
				title: mock(() => Promise.resolve("New Page")),
			});
			const newTabState = {
				page: newPage,
				consoleBuffer: {
					push: mock(() => {}),
					drain: mock(() => []),
					peek: mock(() => []),
					clear: mock(() => {}),
				} as never,
				networkBuffer: {
					push: mock(() => {}),
					drain: mock(() => []),
					peek: mock(() => []),
					clear: mock(() => {}),
				} as never,
			};
			const clearRefs = mock(() => {});
			const createTab = mock(() => Promise.resolve(newTabState));

			const res = await handleTab(
				registry,
				["new", "https://example.com/new"],
				{ clearRefs, createTab },
			);
			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.data).toContain("tab 2");
			}
			expect(newPage.goto).toHaveBeenCalledWith("https://example.com/new", {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});
		});
	});

	describe("switch", () => {
		test("switches to specified tab", async () => {
			const registry = createRegistry(3);
			const clearRefs = mock(() => {});

			const res = await handleTab(registry, ["switch", "2"], {
				clearRefs,
				createTab: mock(() => Promise.resolve(registry.tabs[0])),
			});
			expect(res.ok).toBe(true);
			expect(registry.activeTabIndex).toBe(1);
			expect(clearRefs).toHaveBeenCalled();
			if (res.ok) {
				expect(res.data).toContain("tab 2");
			}
		});

		test("returns error for out-of-range index", async () => {
			const registry = createRegistry(2);

			const res = await handleTab(registry, ["switch", "5"], {
				clearRefs: mock(() => {}),
				createTab: mock(() => Promise.resolve(registry.tabs[0])),
			});
			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("5");
				expect(res.error).toContain("1–2");
			}
		});

		test("returns error for non-numeric index", async () => {
			const registry = createRegistry(2);

			const res = await handleTab(registry, ["switch", "abc"], {
				clearRefs: mock(() => {}),
				createTab: mock(() => Promise.resolve(registry.tabs[0])),
			});
			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("Invalid tab index");
			}
		});

		test("returns error when no index provided", async () => {
			const registry = createRegistry(2);

			const res = await handleTab(registry, ["switch"], {
				clearRefs: mock(() => {}),
				createTab: mock(() => Promise.resolve(registry.tabs[0])),
			});
			expect(res.ok).toBe(false);
		});
	});

	describe("close", () => {
		test("closes active tab and switches to nearest", async () => {
			const registry = createRegistry(3);
			registry.activeTabIndex = 1;
			const clearRefs = mock(() => {});

			const res = await handleTab(registry, ["close"], {
				clearRefs,
				createTab: mock(() => Promise.resolve(registry.tabs[0])),
			});
			expect(res.ok).toBe(true);
			expect(registry.tabs).toHaveLength(2);
			expect(clearRefs).toHaveBeenCalled();
			if (res.ok) {
				expect(res.data).toContain("Closed tab 2");
			}
		});

		test("closes tab by index", async () => {
			const registry = createRegistry(3);
			const clearRefs = mock(() => {});

			const res = await handleTab(registry, ["close", "3"], {
				clearRefs,
				createTab: mock(() => Promise.resolve(registry.tabs[0])),
			});
			expect(res.ok).toBe(true);
			expect(registry.tabs).toHaveLength(2);
		});

		test("rejects closing the last tab", async () => {
			const registry = createRegistry(1);

			const res = await handleTab(registry, ["close"], {
				clearRefs: mock(() => {}),
				createTab: mock(() => Promise.resolve(registry.tabs[0])),
			});
			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("Cannot close the only open tab");
			}
		});

		test("adjusts active index when closing tab before active", async () => {
			const registry = createRegistry(3);
			registry.activeTabIndex = 2;

			const res = await handleTab(registry, ["close", "1"], {
				clearRefs: mock(() => {}),
				createTab: mock(() => Promise.resolve(registry.tabs[0])),
			});
			expect(res.ok).toBe(true);
			expect(registry.activeTabIndex).toBe(1);
		});

		test("closing first tab with it active switches to new tab 1", async () => {
			const registry = createRegistry(2);
			registry.activeTabIndex = 0;
			const clearRefs = mock(() => {});

			const res = await handleTab(registry, ["close", "1"], {
				clearRefs,
				createTab: mock(() => Promise.resolve(registry.tabs[0])),
			});
			expect(res.ok).toBe(true);
			expect(registry.activeTabIndex).toBe(0);
			expect(registry.tabs).toHaveLength(1);
		});

		test("returns error for out-of-range index", async () => {
			const registry = createRegistry(2);

			const res = await handleTab(registry, ["close", "5"], {
				clearRefs: mock(() => {}),
				createTab: mock(() => Promise.resolve(registry.tabs[0])),
			});
			expect(res.ok).toBe(false);
		});
	});
});
