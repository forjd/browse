import { describe, expect, mock, test } from "bun:test";
import { handleTestMatrix } from "../src/commands/test-matrix.ts";
import type { BrowseConfig } from "../src/config.ts";
import { CustomReporterRegistry } from "../src/custom-reporter.ts";

const TEST_USER_ENV = "BROWSE_TEST_MATRIX_USER";
const TEST_PASS_ENV = "BROWSE_TEST_MATRIX_PASS";

const BASE_CONFIG: BrowseConfig = {
	environments: {
		admin: {
			loginUrl: "https://example.com/login",
			userEnvVar: TEST_USER_ENV,
			passEnvVar: TEST_PASS_ENV,
			successCondition: { urlContains: "/dashboard" },
		},
		viewer: {
			loginUrl: "https://example.com/login",
			userEnvVar: TEST_USER_ENV,
			passEnvVar: TEST_PASS_ENV,
			successCondition: { urlContains: "/dashboard" },
		},
	},
	flows: {
		smoke: {
			description: "Smoke test",
			steps: [{ goto: "https://example.com/app" }],
		},
	},
};

function createMockRolePage() {
	return {
		goto: mock(async () => null),
		getByRole: mock(() => ({
			fill: mock(async () => {}),
			click: mock(async () => {}),
			first: () => ({
				isVisible: mock(async () => true),
				innerText: mock(async () => ""),
			}),
			count: mock(async () => 1),
		})),
		waitForURL: mock(async () => null),
		url: mock(() => "https://example.com/dashboard"),
		on: mock(() => {}),
		title: mock(async () => "Dashboard"),
		evaluate: mock(async () => null),
		innerText: mock(async () => ""),
		locator: mock(() => ({
			first: () => ({
				isVisible: mock(async () => true),
				innerText: mock(async () => ""),
			}),
			count: mock(async () => 1),
			innerText: mock(async () => ""),
		})),
	} as any;
}

function createDefaultContext() {
	const browser = {
		newContext: mock(async () => {
			const page = createMockRolePage();
			return {
				newPage: mock(async () => page),
				close: mock(async () => {}),
			};
		}),
	};

	return {
		browser: () => browser,
	} as any;
}

describe("handleTestMatrix reporter support", () => {
	test("rejects invalid reporter names", async () => {
		const result = await handleTestMatrix(
			BASE_CONFIG,
			null as any,
			["--roles", "admin,viewer", "--flow", "smoke", "--reporter", "csv"],
			null as any,
			null as any,
			createDefaultContext(),
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Invalid reporter 'csv'");
			expect(result.error).toContain("tap");
			expect(result.error).toContain("allure");
			expect(result.error).toContain("html");
		}
	});

	test("returns TAP output with --reporter tap", async () => {
		const previousUser = process.env[TEST_USER_ENV];
		const previousPass = process.env[TEST_PASS_ENV];
		process.env[TEST_USER_ENV] = "user";
		process.env[TEST_PASS_ENV] = "pass";

		try {
			const result = await handleTestMatrix(
				BASE_CONFIG,
				null as any,
				["--roles", "admin,viewer", "--flow", "smoke", "--reporter", "tap"],
				null as any,
				null as any,
				createDefaultContext(),
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data).toContain("TAP version 13");
				expect(result.data).toContain("1..2");
				expect(result.data).toContain("[admin] goto https://example.com/app");
				expect(result.data).toContain("[viewer] goto https://example.com/app");
			}
		} finally {
			if (previousUser === undefined) {
				delete process.env[TEST_USER_ENV];
			} else {
				process.env[TEST_USER_ENV] = previousUser;
			}

			if (previousPass === undefined) {
				delete process.env[TEST_PASS_ENV];
			} else {
				process.env[TEST_PASS_ENV] = previousPass;
			}
		}
	});

	test("returns plugin reporter output with a registered custom reporter", async () => {
		const previousUser = process.env[TEST_USER_ENV];
		const previousPass = process.env[TEST_PASS_ENV];
		process.env[TEST_USER_ENV] = "user";
		process.env[TEST_PASS_ENV] = "pass";
		const reporters = new CustomReporterRegistry();
		reporters.register({
			name: "teamcity",
			render: ({ flowName, results }) =>
				`teamcity:${flowName}:${results.length}`,
		});

		try {
			const result = await handleTestMatrix(
				BASE_CONFIG,
				null as any,
				[
					"--roles",
					"admin,viewer",
					"--flow",
					"smoke",
					"--reporter",
					"teamcity",
				],
				null as any,
				null as any,
				createDefaultContext(),
				undefined,
				undefined,
				undefined,
				reporters,
			);

			expect(result).toEqual({
				ok: true,
				data: "teamcity:test-matrix-smoke:2",
			});
		} finally {
			if (previousUser === undefined) {
				delete process.env[TEST_USER_ENV];
			} else {
				process.env[TEST_USER_ENV] = previousUser;
			}

			if (previousPass === undefined) {
				delete process.env[TEST_PASS_ENV];
			} else {
				process.env[TEST_PASS_ENV] = previousPass;
			}
		}
	});
});
