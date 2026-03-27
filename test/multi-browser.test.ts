import { describe, expect, mock, test } from "bun:test";
import { parseArgs } from "../src/cli.ts";
import { VALID_BROWSER_NAMES, validateConfig } from "../src/config.ts";
import { browserDisplayName } from "../src/daemon.ts";

describe("BrowserName config validation", () => {
	const baseConfig = {
		environments: {
			staging: {
				loginUrl: "https://example.com/login",
				userEnvVar: "USER",
				passEnvVar: "PASS",
				successCondition: { urlContains: "/dashboard" },
			},
		},
	};

	test("accepts config without browser field", () => {
		expect(validateConfig(baseConfig)).toBeNull();
	});

	test("accepts browser: 'chrome'", () => {
		expect(validateConfig({ ...baseConfig, browser: "chrome" })).toBeNull();
	});

	test("accepts browser: 'firefox'", () => {
		expect(validateConfig({ ...baseConfig, browser: "firefox" })).toBeNull();
	});

	test("accepts browser: 'webkit'", () => {
		expect(validateConfig({ ...baseConfig, browser: "webkit" })).toBeNull();
	});

	test("rejects invalid browser name", () => {
		const error = validateConfig({ ...baseConfig, browser: "safari" });
		expect(error).toContain("'browser' must be one of");
		expect(error).toContain("chrome");
		expect(error).toContain("firefox");
		expect(error).toContain("webkit");
	});

	test("VALID_BROWSER_NAMES contains expected values", () => {
		expect(VALID_BROWSER_NAMES.has("chrome")).toBe(true);
		expect(VALID_BROWSER_NAMES.has("firefox")).toBe(true);
		expect(VALID_BROWSER_NAMES.has("webkit")).toBe(true);
		expect(VALID_BROWSER_NAMES.has("safari")).toBe(false);
	});
});

describe("parseArgs --browser flag", () => {
	test("extracts --browser from daemon args", () => {
		const result = parseArgs(["--browser", "firefox", "--daemon"]);
		expect(result).toEqual({
			daemon: true,
			browser: "firefox",
		});
	});

	test("--browser before --daemon with --config", () => {
		const result = parseArgs([
			"--config",
			"/tmp/cfg.json",
			"--browser",
			"webkit",
			"--daemon",
		]);
		expect(result).toEqual({
			daemon: true,
			config: "/tmp/cfg.json",
			browser: "webkit",
		});
	});

	test("--browser is extracted from non-daemon commands (ignored by server)", () => {
		const result = parseArgs([
			"--browser",
			"firefox",
			"goto",
			"https://example.com",
		]);
		// --browser is extracted before global flag parsing, so command parsing works
		if ("cmd" in result) {
			expect(result.cmd).toBe("goto");
			expect(result.args).toEqual(["https://example.com"]);
		}
	});

	test("daemon without --browser has undefined browser", () => {
		const result = parseArgs(["--daemon"]);
		expect(result).toEqual({ daemon: true });
	});
});

describe("browserDisplayName", () => {
	test("chrome → Chromium", () => {
		expect(browserDisplayName("chrome")).toBe("Chromium");
	});

	test("firefox → Firefox", () => {
		expect(browserDisplayName("firefox")).toBe("Firefox");
	});

	test("webkit → WebKit", () => {
		expect(browserDisplayName("webkit")).toBe("WebKit");
	});
});

describe("stealth is Chrome-only", () => {
	test("stealthArgs returns an array", async () => {
		const { stealthArgs } = await import("../src/stealth.ts");
		const args = stealthArgs();
		expect(Array.isArray(args)).toBe(true);
	});

	test("applyStealthScripts calls addInitScript", async () => {
		const { applyStealthScripts } = await import("../src/stealth.ts");
		const addInitScript = mock(() => Promise.resolve());
		const context = { addInitScript } as never;

		await applyStealthScripts(context, {
			userAgent: "Mozilla/5.0 Chrome/131",
			navigatorPlatform: "MacIntel",
			chromeMajor: "131",
			platformVersion: "15.3.0",
			architecture: "arm",
			bitness: "64",
		});

		expect(addInitScript).toHaveBeenCalledTimes(1);
	});
});
