import { describe, expect, mock, test } from "bun:test";
import { RingBuffer } from "../src/buffers.ts";
import type { ConsoleEntry } from "../src/commands/console.ts";
import type { HealthcheckDeps } from "../src/commands/healthcheck.ts";
import {
	handleHealthcheck,
	parseHealthcheckArgs,
} from "../src/commands/healthcheck.ts";
import type { NetworkEntry } from "../src/commands/network.ts";
import type { BrowseConfig } from "../src/config.ts";

const BASE_CONFIG: BrowseConfig = {
	environments: {
		staging: {
			loginUrl: "https://example.com/login",
			userEnvVar: "U",
			passEnvVar: "P",
			successCondition: { urlContains: "/dashboard" },
		},
	},
	healthcheck: {
		pages: [
			{ url: "{{base_url}}/api/health", name: "API Health", screenshot: false },
			{ url: "{{base_url}}/dashboard", name: "Dashboard" },
			{ url: "{{base_url}}/settings", name: "Settings" },
		],
	},
};

describe("parseHealthcheckArgs", () => {
	test("parses --var flags", () => {
		const result = parseHealthcheckArgs([
			"--var",
			"base_url=https://example.com",
		]);
		expect(result.vars).toEqual({ base_url: "https://example.com" });
		expect(result.noScreenshots).toBe(false);
	});

	test("parses --no-screenshots flag", () => {
		const result = parseHealthcheckArgs([
			"--var",
			"base_url=https://example.com",
			"--no-screenshots",
		]);
		expect(result.noScreenshots).toBe(true);
	});

	test("parses empty args", () => {
		const result = parseHealthcheckArgs([]);
		expect(result.vars).toEqual({});
		expect(result.noScreenshots).toBe(false);
	});
});

describe("handleHealthcheck — validation", () => {
	test("returns error when no config", async () => {
		const result = await handleHealthcheck(null, null as any, [], null as any);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("browse.config.json");
		}
	});

	test("returns validation error when config is invalid", async () => {
		const result = await handleHealthcheck(
			null,
			null as any,
			[],
			null as any,
			undefined,
			{
				configError:
					"Invalid browse.config.json: 'healthcheck' must be an object.",
			},
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Invalid browse.config.json");
			expect(result.error).toContain("'healthcheck' must be an object");
			expect(result.error).not.toContain("No browse.config.json found");
		}
	});

	test("returns error when no healthcheck config", async () => {
		const configNoHc: BrowseConfig = {
			environments: BASE_CONFIG.environments,
		};
		const result = await handleHealthcheck(
			configNoHc,
			null as any,
			[],
			null as any,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("No healthcheck pages defined");
		}
	});
});

// -- Helpers for runtime tests --

function makeDeps(): HealthcheckDeps {
	return {
		consoleBuffer: new RingBuffer<ConsoleEntry>(),
		networkBuffer: new RingBuffer<NetworkEntry>(),
	};
}

function makeConsoleEntry(overrides: Partial<ConsoleEntry> = {}): ConsoleEntry {
	return {
		level: "error",
		text: "Uncaught TypeError",
		location: {
			url: "https://example.com/app.js",
			lineNumber: 42,
			columnNumber: 1,
		},
		...overrides,
	};
}

/**
 * Build a mock Playwright Page with configurable behaviour.
 * - `gotoFn` controls navigation (defaults to resolving successfully).
 * - `bodyText` is returned by `innerText("body")`.
 * - `currentUrl` is returned by `url()`.
 * - `visibleSelectors` controls which selectors report as visible.
 * - `elementCounts` maps selectors to the count returned by `locator(sel).count()`.
 */
function mockPage(
	opts: {
		gotoFn?: (...args: any[]) => Promise<any>;
		bodyText?: string;
		currentUrl?: string;
		visibleSelectors?: Set<string>;
		elementCounts?: Record<string, number>;
		elementTexts?: Record<string, string>;
	} = {},
) {
	const {
		gotoFn = mock(() => Promise.resolve()),
		bodyText = "",
		currentUrl = "https://example.com/dashboard",
		visibleSelectors = new Set<string>(),
		elementCounts = {},
		elementTexts = {},
	} = opts;

	const page: any = {
		goto: gotoFn,
		screenshot: mock(() => Promise.resolve()),
		innerText: mock((sel: string) => {
			if (sel === "body") return Promise.resolve(bodyText);
			if (elementTexts[sel]) return Promise.resolve(elementTexts[sel]);
			return Promise.resolve("");
		}),
		url: mock(() => currentUrl),
		locator: mock((selector: string) => {
			const isVisible = visibleSelectors.has(selector);
			const count = elementCounts[selector] ?? (isVisible ? 1 : 0);
			const text = elementTexts[selector] ?? "";
			return {
				first: () => ({
					isVisible: () => Promise.resolve(isVisible),
					innerText: () => Promise.resolve(text),
				}),
				count: () => Promise.resolve(count),
				innerText: () => Promise.resolve(text),
			};
		}),
	};
	return page;
}

function singlePageConfig(
	pageOverrides: Record<string, any> = {},
): BrowseConfig {
	return {
		environments: BASE_CONFIG.environments,
		healthcheck: {
			pages: [
				{
					url: "https://example.com/home",
					name: "Home",
					screenshot: false,
					...pageOverrides,
				},
			],
		},
	};
}

// -- Runtime tests --

describe("handleHealthcheck — successful navigation", () => {
	test("returns ok when all pages pass", async () => {
		const config = singlePageConfig();
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
		expect(page.goto).toHaveBeenCalledTimes(1);
		expect(page.goto).toHaveBeenCalledWith("https://example.com/home", {
			waitUntil: "domcontentloaded",
			timeout: 30_000,
		});
	});

	test("report contains page name and URL on success", async () => {
		const config = singlePageConfig();
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("1/1 pages passed");
			expect(result.data).toContain("Home");
			expect(result.data).toContain("https://example.com/home");
			// Console should be clean when no errors
			expect(result.data).toContain("Console: clean");
		}
	});
});

describe("handleHealthcheck — navigation failure", () => {
	test("marks page as failed when goto throws", async () => {
		const config = singlePageConfig();
		const page = mockPage({
			gotoFn: mock(() =>
				Promise.reject(new Error("net::ERR_CONNECTION_REFUSED")),
			),
		});
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("0/1 pages passed");
			expect(result.error).toContain("Navigation failed");
			expect(result.error).toContain("net::ERR_CONNECTION_REFUSED");
		}
	});

	test("handles non-Error throw in navigation", async () => {
		const config = singlePageConfig();
		const page = mockPage({
			gotoFn: mock(() => Promise.reject("timeout")),
		});
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Navigation failed: timeout");
		}
	});
});

describe("handleHealthcheck — screenshots", () => {
	test("skips screenshot when --no-screenshots is passed", async () => {
		const config = singlePageConfig({ screenshot: true });
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(
			config,
			page,
			["--no-screenshots"],
			deps,
		);

		expect(result.ok).toBe(true);
		expect(page.screenshot).not.toHaveBeenCalled();
	});

	test("skips screenshot when page config has screenshot: false", async () => {
		const config = singlePageConfig({ screenshot: false });
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
		expect(page.screenshot).not.toHaveBeenCalled();
	});

	test("takes screenshot when enabled and report includes path", async () => {
		const config = singlePageConfig({ screenshot: true });
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
		expect(page.screenshot).toHaveBeenCalledTimes(1);
		if (result.ok) {
			expect(result.data).toContain("Screenshot:");
			expect(result.data).toContain("healthcheck-home-");
			// Screenshots section at the bottom
			expect(result.data).toContain("Screenshots:");
		}
	});

	test("screenshot defaults to enabled when not explicitly set", async () => {
		// Remove the screenshot: false override
		const config: BrowseConfig = {
			environments: BASE_CONFIG.environments,
			healthcheck: {
				pages: [{ url: "https://example.com/page", name: "Page" }],
			},
		};
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
		expect(page.screenshot).toHaveBeenCalledTimes(1);
	});
});

describe("handleHealthcheck — console errors", () => {
	test("passes with console warnings when console is not explicitly configured", async () => {
		const config = singlePageConfig();
		const page = mockPage();
		const deps = makeDeps();

		// Push console errors after drain is called (simulating browser console output)
		const originalGoto = page.goto;
		page.goto = mock(async (...args: any[]) => {
			await originalGoto(...args);
			deps.consoleBuffer.push(makeConsoleEntry());
		});

		const result = await handleHealthcheck(config, page, [], deps);

		// Page should PASS — console errors are warnings by default
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Console warnings:");
			expect(result.data).toContain("Uncaught TypeError");
			expect(result.data).not.toContain("Console errors:");
		}
	});

	test("fails when console is explicitly configured and buffer has errors", async () => {
		const config = singlePageConfig({ console: "error" });
		const page = mockPage();
		const deps = makeDeps();

		const originalGoto = page.goto;
		page.goto = mock(async (...args: any[]) => {
			await originalGoto(...args);
			deps.consoleBuffer.push(makeConsoleEntry());
		});

		const result = await handleHealthcheck(config, page, [], deps);

		// Page should FAIL — console checking was explicitly opted into
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Console errors:");
			expect(result.error).toContain("Uncaught TypeError");
		}
	});

	test("fails when console: warning is explicitly configured and buffer has warnings", async () => {
		const config = singlePageConfig({ console: "warning" });
		const page = mockPage();
		const deps = makeDeps();

		const originalGoto = page.goto;
		page.goto = mock(async (...args: any[]) => {
			await originalGoto(...args);
			deps.consoleBuffer.push(
				makeConsoleEntry({ level: "warning", text: "Deprecated API usage" }),
			);
		});

		const result = await handleHealthcheck(config, page, [], deps);

		// Page should FAIL — console checking was explicitly opted into
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Console warnings:");
			expect(result.error).toContain("Deprecated API usage");
		}
	});

	test("passes when console buffer is empty", async () => {
		const config = singlePageConfig();
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
	});

	test("drains console buffer before each page navigation", async () => {
		const config = singlePageConfig();
		const page = mockPage();
		const deps = makeDeps();

		// Push a stale console error that should be drained before navigation
		deps.consoleBuffer.push(makeConsoleEntry({ text: "stale error" }));

		// The drain before navigation should clear this, and no new errors appear
		// after navigation, so the page should pass.
		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
	});

	test("shows Console: clean when no console entries and console not configured", async () => {
		const config = singlePageConfig();
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Console: clean");
		}
	});

	test("shows Console: clean when console explicitly configured but buffer empty", async () => {
		const config = singlePageConfig({ console: "error" });
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Console: clean");
		}
	});
});

describe("handleHealthcheck — assertions", () => {
	test("passes when textContains assertion matches", async () => {
		const config = singlePageConfig({
			assertions: [{ textContains: "Welcome" }],
		});
		const page = mockPage({ bodyText: "Welcome to the dashboard" });
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Assertions: 1/1 passed");
		}
	});

	test("fails when textContains assertion does not match", async () => {
		const config = singlePageConfig({
			assertions: [{ textContains: "Admin Panel" }],
		});
		const page = mockPage({ bodyText: "Welcome to the dashboard" });
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Assertions: 0/1 passed");
			expect(result.error).toContain('textContains "Admin Panel"');
		}
	});

	test("passes when urlContains assertion matches", async () => {
		const config = singlePageConfig({
			assertions: [{ urlContains: "/dashboard" }],
		});
		const page = mockPage({ currentUrl: "https://example.com/dashboard" });
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
	});

	test("fails when urlContains assertion does not match", async () => {
		const config = singlePageConfig({
			assertions: [{ urlContains: "/settings" }],
		});
		const page = mockPage({ currentUrl: "https://example.com/dashboard" });
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('urlContains "/settings"');
		}
	});

	test("passes when visible assertion matches", async () => {
		const config = singlePageConfig({
			assertions: [{ visible: "#main-content" }],
		});
		const page = mockPage({ visibleSelectors: new Set(["#main-content"]) });
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Assertions: 1/1 passed");
		}
	});

	test("fails when visible assertion does not match", async () => {
		const config = singlePageConfig({
			assertions: [{ visible: "#missing-element" }],
		});
		const page = mockPage({ visibleSelectors: new Set() });
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('visible "#missing-element"');
		}
	});

	test("handles multiple assertions with mixed results", async () => {
		const config = singlePageConfig({
			assertions: [
				{ textContains: "Welcome" },
				{ urlContains: "/admin" },
				{ visible: "#header" },
			],
		});
		const page = mockPage({
			bodyText: "Welcome to the app",
			currentUrl: "https://example.com/dashboard",
			visibleSelectors: new Set(["#header"]),
		});
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		// textContains passes, urlContains fails, visible passes => overall fail
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Assertions: 2/3 passed");
			expect(result.error).toContain('urlContains "/admin"');
		}
	});

	test("skips assertions when none are configured", async () => {
		const config = singlePageConfig();
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).not.toContain("Assertions:");
		}
	});
});

describe("handleHealthcheck — variable interpolation", () => {
	test("interpolates vars in page URLs", async () => {
		const config: BrowseConfig = {
			environments: BASE_CONFIG.environments,
			healthcheck: {
				pages: [
					{
						url: "{{base_url}}/status",
						name: "Status",
						screenshot: false,
					},
				],
			},
		};
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(
			config,
			page,
			["--var", "base_url=https://staging.example.com"],
			deps,
		);

		expect(result.ok).toBe(true);
		expect(page.goto).toHaveBeenCalledWith(
			"https://staging.example.com/status",
			expect.objectContaining({ waitUntil: "domcontentloaded" }),
		);
	});

	test("uses raw URL when no vars provided for template", async () => {
		const config: BrowseConfig = {
			environments: BASE_CONFIG.environments,
			healthcheck: {
				pages: [
					{
						url: "{{base_url}}/api",
						name: "API",
						screenshot: false,
					},
				],
			},
		};
		const page = mockPage();
		const deps = makeDeps();

		const _result = await handleHealthcheck(config, page, [], deps);

		// Unresolved template is passed through as-is
		expect(page.goto).toHaveBeenCalledTimes(1);
	});
});

describe("handleHealthcheck — report formatting", () => {
	test("report includes tick mark for passing pages", async () => {
		const config = singlePageConfig();
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			// Unicode tick mark for passing pages
			expect(result.data).toContain("\u2713 Home");
		}
	});

	test("report includes cross mark for failing pages", async () => {
		const config = singlePageConfig({
			assertions: [{ textContains: "nonexistent" }],
		});
		const page = mockPage({ bodyText: "Hello" });
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			// Unicode cross mark for failing pages
			expect(result.error).toContain("\u2717 Home");
		}
	});

	test("uses URL path as name when no name is configured", async () => {
		const config: BrowseConfig = {
			environments: BASE_CONFIG.environments,
			healthcheck: {
				pages: [
					{
						url: "https://example.com/api/health",
						screenshot: false,
					},
				],
			},
		};
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			// When no name is provided, the path portion of the URL is used
			expect(result.data).toContain("/api/health");
		}
	});

	test("report counts multiple pages correctly", async () => {
		const config: BrowseConfig = {
			environments: BASE_CONFIG.environments,
			healthcheck: {
				pages: [
					{ url: "https://example.com/a", name: "Page A", screenshot: false },
					{ url: "https://example.com/b", name: "Page B", screenshot: false },
					{ url: "https://example.com/c", name: "Page C", screenshot: false },
				],
			},
		};
		const page = mockPage();
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("3/3 pages passed");
		}
	});

	test("report shows partial pass count with mixed results", async () => {
		const config: BrowseConfig = {
			environments: BASE_CONFIG.environments,
			healthcheck: {
				pages: [
					{ url: "https://example.com/ok", name: "OK Page", screenshot: false },
					{
						url: "https://example.com/fail",
						name: "Fail Page",
						screenshot: false,
						assertions: [{ textContains: "missing text" }],
					},
				],
			},
		};
		const page = mockPage({ bodyText: "Hello world" });
		const deps = makeDeps();

		const result = await handleHealthcheck(config, page, [], deps);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("1/2 pages passed");
		}
	});
});

describe("handleHealthcheck — null deps", () => {
	test("works without deps (no console checking)", async () => {
		const config = singlePageConfig();
		const page = mockPage();

		const result = await handleHealthcheck(config, page, [], null);

		expect(result.ok).toBe(true);
		if (result.ok) {
			// No console section when deps is null (no buffer to check)
			expect(result.data).not.toContain("Console errors:");
		}
	});
});
