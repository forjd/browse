import { describe, expect, test } from "bun:test";
import {
	handleHealthcheck,
	parseHealthcheckArgs,
} from "../src/commands/healthcheck.ts";
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
