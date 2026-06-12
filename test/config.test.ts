import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	canLoadCodeFromConfig,
	loadConfig,
	TRUST_PROJECT_CONFIG_ENV,
	validateConfig,
} from "../src/config.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-config");
const ORIGINAL_TRUST_PROJECT_CONFIG = process.env[TRUST_PROJECT_CONFIG_ENV];

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
	if (ORIGINAL_TRUST_PROJECT_CONFIG === undefined) {
		delete process.env[TRUST_PROJECT_CONFIG_ENV];
	} else {
		process.env[TRUST_PROJECT_CONFIG_ENV] = ORIGINAL_TRUST_PROJECT_CONFIG;
	}
});

describe("loadConfig", () => {
	test("returns null when config file does not exist", () => {
		const result = loadConfig(join(TEST_DIR, "nonexistent.json"));
		expect(result).toEqual({ config: null, error: null });
	});

	test("returns error for invalid JSON", () => {
		const path = join(TEST_DIR, "browse.config.json");
		writeFileSync(path, "not json at all");

		const result = loadConfig(path);
		expect(result.config).toBeNull();
		expect(result.error).toContain("Failed to parse browse.config.json");
	});

	test("loads valid config successfully", () => {
		const path = join(TEST_DIR, "browse.config.json");
		const config = {
			environments: {
				staging: {
					loginUrl: "https://staging.example.com/login",
					userEnvVar: "BROWSE_STAGING_USER",
					passEnvVar: "BROWSE_STAGING_PASS",
					successCondition: { urlContains: "/dashboard" },
				},
			},
		};
		writeFileSync(path, JSON.stringify(config));

		const result = loadConfig(path);
		expect(result.error).toBeNull();
		expect(result.config).toEqual(config);
	});
});

describe("canLoadCodeFromConfig", () => {
	test("trusts global config plugin entries by default", () => {
		delete process.env[TRUST_PROJECT_CONFIG_ENV];

		expect(canLoadCodeFromConfig("global")).toBe(true);
	});

	test("blocks project and explicit config plugin entries by default", () => {
		delete process.env[TRUST_PROJECT_CONFIG_ENV];

		expect(canLoadCodeFromConfig("project")).toBe(false);
		expect(canLoadCodeFromConfig("explicit")).toBe(false);
		expect(canLoadCodeFromConfig(null)).toBe(false);
	});

	test("allows non-global config plugin entries when explicitly trusted", () => {
		process.env[TRUST_PROJECT_CONFIG_ENV] = "1";

		expect(canLoadCodeFromConfig("project")).toBe(true);
		expect(canLoadCodeFromConfig("explicit")).toBe(true);
	});
});

describe("validateConfig", () => {
	test("returns error when environments is missing", () => {
		const result = validateConfig({});
		expect(result).toContain("missing 'environments'");
	});

	test("returns error when environments is not an object", () => {
		const result = validateConfig({ environments: "bad" });
		expect(result).toContain("missing 'environments'");
	});

	test("returns error when loginUrl is missing", () => {
		const result = validateConfig({
			environments: {
				staging: {
					userEnvVar: "U",
					passEnvVar: "P",
					successCondition: { urlContains: "/" },
				},
			},
		});
		expect(result).toContain("staging");
		expect(result).toContain("loginUrl");
	});

	test("returns error when userEnvVar is missing", () => {
		const result = validateConfig({
			environments: {
				staging: {
					loginUrl: "https://example.com/login",
					passEnvVar: "P",
					successCondition: { urlContains: "/" },
				},
			},
		});
		expect(result).toContain("staging");
		expect(result).toContain("userEnvVar");
	});

	test("returns error when passEnvVar is missing", () => {
		const result = validateConfig({
			environments: {
				staging: {
					loginUrl: "https://example.com/login",
					userEnvVar: "U",
					successCondition: { urlContains: "/" },
				},
			},
		});
		expect(result).toContain("staging");
		expect(result).toContain("passEnvVar");
	});

	test("returns error when successCondition is missing", () => {
		const result = validateConfig({
			environments: {
				staging: {
					loginUrl: "https://example.com/login",
					userEnvVar: "U",
					passEnvVar: "P",
				},
			},
		});
		expect(result).toContain("staging");
		expect(result).toContain("successCondition");
	});

	test("returns error for invalid successCondition shape", () => {
		const result = validateConfig({
			environments: {
				staging: {
					loginUrl: "https://example.com/login",
					userEnvVar: "U",
					passEnvVar: "P",
					successCondition: { badKey: "value" },
				},
			},
		});
		expect(result).toContain("staging");
		expect(result).toContain("successCondition");
	});

	test("returns null for valid config", () => {
		const result = validateConfig({
			environments: {
				staging: {
					loginUrl: "https://staging.example.com/login",
					userEnvVar: "BROWSE_STAGING_USER",
					passEnvVar: "BROWSE_STAGING_PASS",
					successCondition: { urlContains: "/dashboard" },
				},
				production: {
					loginUrl: "https://app.example.com/login",
					userEnvVar: "BROWSE_PROD_USER",
					passEnvVar: "BROWSE_PROD_PASS",
					successCondition: { elementVisible: ".user-menu" },
				},
			},
		});
		expect(result).toBeNull();
	});

	test("accepts urlPattern success condition", () => {
		const result = validateConfig({
			environments: {
				test: {
					loginUrl: "https://example.com/login",
					userEnvVar: "U",
					passEnvVar: "P",
					successCondition: { urlPattern: "^https://.*/(dashboard|home)" },
				},
			},
		});
		expect(result).toBeNull();
	});

	test("accepts artifact retention configuration", () => {
		const result = validateConfig({
			environments: {
				test: {
					loginUrl: "https://example.com/login",
					userEnvVar: "U",
					passEnvVar: "P",
					successCondition: { urlContains: "/" },
				},
			},
			artifacts: {
				retention: {
					default: "7d",
					screenshots: "2d",
					traces: "14d",
					videos: "30d",
				},
			},
		});
		expect(result).toBeNull();
	});

	test("rejects invalid artifact retention values", () => {
		const result = validateConfig({
			environments: {
				test: {
					loginUrl: "https://example.com/login",
					userEnvVar: "U",
					passEnvVar: "P",
					successCondition: { urlContains: "/" },
				},
			},
			artifacts: {
				retention: {
					traces: "later",
				},
			},
		});
		expect(result).toContain("artifacts.retention.traces");
	});
});
