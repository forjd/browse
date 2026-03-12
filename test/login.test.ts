import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { handleLogin } from "../src/commands/login.ts";
import type { BrowseConfig } from "../src/config.ts";

const VALID_CONFIG: BrowseConfig = {
	environments: {
		staging: {
			loginUrl: "https://staging.example.com/login",
			userEnvVar: "BROWSE_STAGING_USER",
			passEnvVar: "BROWSE_STAGING_PASS",
			submitButton: "Sign in",
			successCondition: { urlContains: "/dashboard" },
		},
		production: {
			loginUrl: "https://app.example.com/login",
			userEnvVar: "BROWSE_PROD_USER",
			passEnvVar: "BROWSE_PROD_PASS",
			successCondition: { elementVisible: ".user-menu" },
		},
	},
};

function mockPage(overrides: Record<string, unknown> = {}) {
	return {
		goto: mock(() => Promise.resolve()),
		url: mock(() => "https://staging.example.com/dashboard"),
		title: mock(() => Promise.resolve("Dashboard")),
		locator: mock(() => ({
			ariaSnapshot: mock(() =>
				Promise.resolve(
					'- textbox "Username"\n- textbox "Password"\n- button "Sign in"',
				),
			),
		})),
		getByRole: mock((_role: string, _opts: { name: string }) => ({
			fill: mock(() => Promise.resolve()),
			click: mock(() => Promise.resolve()),
			nth: mock(() => ({
				fill: mock(() => Promise.resolve()),
				click: mock(() => Promise.resolve()),
			})),
		})),
		waitForURL: mock(() => Promise.resolve()),
		waitForSelector: mock(() => Promise.resolve()),
		screenshot: mock(() => Promise.resolve()),
		...overrides,
	} as never;
}

describe("login command", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env.BROWSE_STAGING_USER = "testuser";
		process.env.BROWSE_STAGING_PASS = "testpass";
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	test("returns error when no config is loaded", async () => {
		const res = await handleLogin(null, mockPage(), ["--env", "staging"]);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("browse.config.json");
		}
	});

	test("returns error when --env flag is missing", async () => {
		const res = await handleLogin(VALID_CONFIG, mockPage(), []);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("--env");
		}
	});

	test("returns error when --env has no value", async () => {
		const res = await handleLogin(VALID_CONFIG, mockPage(), ["--env"]);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("--env");
		}
	});

	test("returns error for unknown environment", async () => {
		const res = await handleLogin(VALID_CONFIG, mockPage(), ["--env", "test"]);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("test");
			expect(res.error).toContain("staging");
			expect(res.error).toContain("production");
		}
	});

	test("returns error when credentials env vars are missing", async () => {
		delete process.env.BROWSE_STAGING_USER;
		delete process.env.BROWSE_STAGING_PASS;

		const res = await handleLogin(VALID_CONFIG, mockPage(), [
			"--env",
			"staging",
		]);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("BROWSE_STAGING_USER");
			expect(res.error).toContain("BROWSE_STAGING_PASS");
		}
	});

	test("navigates to login URL and fills credentials", async () => {
		const page = mockPage();

		const res = await handleLogin(VALID_CONFIG, page, ["--env", "staging"]);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("Logged in to staging");
		}

		expect(page.goto).toHaveBeenCalledWith(
			"https://staging.example.com/login",
			expect.objectContaining({ waitUntil: "domcontentloaded" }),
		);
	});

	test("returns success with current URL on login", async () => {
		const page = mockPage({
			url: mock(() => "https://staging.example.com/dashboard"),
		});

		const res = await handleLogin(VALID_CONFIG, page, ["--env", "staging"]);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("https://staging.example.com/dashboard");
		}
	});
});
