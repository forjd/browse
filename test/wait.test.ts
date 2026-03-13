import { describe, expect, mock, test } from "bun:test";
import { handleWait } from "../src/commands/wait.ts";
import { assignRefs, clearRefs, markStale } from "../src/refs.ts";

function createMockPage(opts: {
	url?: string;
	bodyText?: string;
	visibleSelectors?: Set<string>;
	networkIdleResolves?: boolean;
}) {
	return {
		url: () => opts.url ?? "https://example.com",
		innerText: mock(async (_selector: string) => opts.bodyText ?? ""),
		locator: (selector: string) => ({
			first: () => ({
				isVisible: mock(
					async () => opts.visibleSelectors?.has(selector) ?? false,
				),
			}),
		}),
		waitForLoadState: mock(async (_state: string) => {
			if (!opts.networkIdleResolves) {
				throw new Error("Timeout exceeded");
			}
		}),
	} as never;
}

describe("handleWait", () => {
	test("returns error when no args given", async () => {
		const page = createMockPage({});

		const result = await handleWait(page, []);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("returns error for unknown subcommand", async () => {
		const page = createMockPage({});

		const result = await handleWait(page, ["badcmd"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown wait type");
		}
	});

	// --- url subcommand ---

	test("url — returns error when substring is missing", async () => {
		const page = createMockPage({});

		const result = await handleWait(page, ["url"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("url — succeeds when URL already contains substring", async () => {
		const page = createMockPage({ url: "https://example.com/dashboard" });

		const result = await handleWait(page, ["url", "/dashboard"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("/dashboard");
		}
	});

	// --- text subcommand ---

	test("text — returns error when text is missing", async () => {
		const page = createMockPage({});

		const result = await handleWait(page, ["text"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("text — succeeds when text is present on page", async () => {
		const page = createMockPage({ bodyText: "Welcome to the dashboard" });

		const result = await handleWait(page, ["text", "Welcome"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Welcome");
		}
	});

	// --- visible subcommand ---

	test("visible — returns error when selector is missing", async () => {
		const page = createMockPage({});

		const result = await handleWait(page, ["visible"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("visible — succeeds when element is already visible", async () => {
		const page = createMockPage({
			visibleSelectors: new Set([".dashboard"]),
		});

		const result = await handleWait(page, ["visible", ".dashboard"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain(".dashboard");
		}
	});

	// --- hidden subcommand ---

	test("hidden — returns error when selector is missing", async () => {
		const page = createMockPage({});

		const result = await handleWait(page, ["hidden"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("hidden — succeeds when element is not visible", async () => {
		const page = createMockPage({ visibleSelectors: new Set() });

		const result = await handleWait(page, ["hidden", ".spinner"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain(".spinner");
		}
	});

	// --- network-idle subcommand ---

	test("network-idle — succeeds when network goes idle", async () => {
		const page = createMockPage({ networkIdleResolves: true });

		const result = await handleWait(page, ["network-idle"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("network idle");
		}
	});

	test("network-idle — returns error on timeout", async () => {
		const page = createMockPage({ networkIdleResolves: false });

		const result = await handleWait(page, ["network-idle"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("network idle");
		}
	});

	// --- numeric delay ---

	test("numeric delay — succeeds with valid milliseconds", async () => {
		const page = createMockPage({});

		const result = await handleWait(page, ["50"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("50ms");
		}
	});

	test("numeric delay — returns error for zero", async () => {
		const page = createMockPage({});

		const result = await handleWait(page, ["0"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown wait type");
		}
	});

	test("numeric delay — returns error for negative value", async () => {
		const page = createMockPage({});

		const result = await handleWait(page, ["-100"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown wait type");
		}
	});

	// --- polling behaviour ---

	test("url — polls until condition is met", async () => {
		let callCount = 0;
		const page = {
			url: () => {
				callCount++;
				return callCount >= 3
					? "https://example.com/dashboard"
					: "https://example.com/login";
			},
		} as never;

		const result = await handleWait(page, ["url", "/dashboard"]);

		expect(result.ok).toBe(true);
		expect(callCount).toBeGreaterThanOrEqual(3);
	});

	test("text — polls until text appears", async () => {
		let callCount = 0;
		const page = {
			innerText: mock(async () => {
				callCount++;
				return callCount >= 3 ? "Welcome back" : "Loading...";
			}),
		} as never;

		const result = await handleWait(page, ["text", "Welcome"]);

		expect(result.ok).toBe(true);
		expect(callCount).toBeGreaterThanOrEqual(3);
	});

	test("visible — polls until element becomes visible", async () => {
		let callCount = 0;
		const page = {
			locator: () => ({
				first: () => ({
					isVisible: mock(async () => {
						callCount++;
						return callCount >= 3;
					}),
				}),
			}),
		} as never;

		const result = await handleWait(page, ["visible", ".loaded"]);

		expect(result.ok).toBe(true);
		expect(callCount).toBeGreaterThanOrEqual(3);
	});

	test("hidden — polls until element disappears", async () => {
		let callCount = 0;
		const page = {
			locator: () => ({
				first: () => ({
					isVisible: mock(async () => {
						callCount++;
						return callCount < 3;
					}),
				}),
			}),
		} as never;

		const result = await handleWait(page, ["hidden", ".spinner"]);

		expect(result.ok).toBe(true);
		expect(callCount).toBeGreaterThanOrEqual(3);
	});

	// --- ref support ---

	test("visible — succeeds with ref when element is visible", async () => {
		clearRefs();
		assignRefs([{ role: "button", name: "Submit" }], "default");
		const page = {
			getByRole: mock(() => ({
				nth: mock(() => ({
					first: () => ({
						isVisible: mock(async () => true),
					}),
				})),
				first: () => ({
					isVisible: mock(async () => true),
				}),
			})),
			locator: mock(() => ({
				first: () => ({
					isVisible: mock(async () => false),
				}),
			})),
		} as never;

		const result = await handleWait(page, ["visible", "@e1"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("@e1");
		}
	});

	test("hidden — succeeds with ref when element is not visible", async () => {
		clearRefs();
		assignRefs([{ role: "button", name: "Submit" }], "default");
		const page = {
			getByRole: mock(() => ({
				nth: mock(() => ({
					first: () => ({
						isVisible: mock(async () => false),
					}),
				})),
				first: () => ({
					isVisible: mock(async () => false),
				}),
			})),
			locator: mock(() => ({
				first: () => ({
					isVisible: mock(async () => true),
				}),
			})),
		} as never;

		const result = await handleWait(page, ["hidden", "@e1"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("@e1");
		}
	});

	test("visible — returns error for stale ref", async () => {
		clearRefs();
		assignRefs([{ role: "button", name: "Submit" }], "default");
		markStale();
		const page = createMockPage({});

		const result = await handleWait(page, ["visible", "@e1"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("stale");
		}
	});

	test("visible — returns error for unknown ref", async () => {
		clearRefs();
		assignRefs([{ role: "button", name: "Submit" }], "default");
		const page = createMockPage({});

		const result = await handleWait(page, ["visible", "@e99"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown ref");
		}
	});
});
