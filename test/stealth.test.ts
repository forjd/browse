import { describe, expect, mock, test } from "bun:test";
import {
	applyStealthScripts,
	getHighEntropyDefaults,
	stealthArgs,
} from "../src/stealth.ts";

describe("stealthArgs", () => {
	test("returns an array of launch args", () => {
		const args = stealthArgs();
		expect(Array.isArray(args)).toBe(true);
	});

	test("includes --disable-blink-features=AutomationControlled", () => {
		const args = stealthArgs();
		expect(args).toContain("--disable-blink-features=AutomationControlled");
	});

	test("loads stealth-worker-fix extension when available", () => {
		const args = stealthArgs();
		const extArg = args.find((a) => a.startsWith("--load-extension="));
		// In the dev environment, extensions/ should be found
		if (extArg) {
			expect(extArg).toContain("stealth-worker-fix");
		}
	});

	test("includes --user-agent flag when UA is provided", () => {
		const ua =
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/146.0.0.0 Safari/537.36";
		const args = stealthArgs(ua);
		expect(args).toContain(`--user-agent=${ua}`);
	});

	test("omits --user-agent flag when no UA is provided", () => {
		const args = stealthArgs();
		const uaArg = args.find((a) => a.startsWith("--user-agent="));
		expect(uaArg).toBeUndefined();
	});
});

describe("getHighEntropyDefaults", () => {
	test("returns non-zero platformVersion", () => {
		const defaults = getHighEntropyDefaults();
		expect(defaults.platformVersion).not.toBe("0.0.0");
	});

	test("returns valid architecture", () => {
		const defaults = getHighEntropyDefaults();
		expect(["arm", "x86"]).toContain(defaults.architecture);
	});

	test("returns 64-bit bitness", () => {
		const defaults = getHighEntropyDefaults();
		expect(defaults.bitness).toBe("64");
	});
});

describe("applyStealthScripts", () => {
	test("calls addInitScript on the context", async () => {
		const addInitScript = mock(() => Promise.resolve());
		const context = { addInitScript } as never;

		await applyStealthScripts(context, {
			userAgent: "Mozilla/5.0 (Macintosh) Chrome/131.0.6778.85",
			navigatorPlatform: "MacIntel",
			chromeMajor: "131",
			chromeFullVersion: "131.0.6778.85",
			platformVersion: "15.3.0",
			architecture: "arm",
			bitness: "64",
		});

		expect(addInitScript).toHaveBeenCalledTimes(1);
		const [fn, args] = addInitScript.mock.calls[0];
		expect(typeof fn).toBe("function");
		expect(args).toEqual({
			userAgent: "Mozilla/5.0 (Macintosh) Chrome/131.0.6778.85",
			navigatorPlatform: "MacIntel",
			chromeMajor: "131",
			chromeFullVersion: "131.0.6778.85",
			platformVersion: "15.3.0",
			architecture: "arm",
			bitness: "64",
		});
	});

	test("init script must not set own toString on getters", async () => {
		const addInitScript = mock(() => Promise.resolve());
		const context = { addInitScript } as never;

		await applyStealthScripts(context, {
			userAgent: "Mozilla/5.0 Chrome/146.0.7680.165",
			navigatorPlatform: "MacIntel",
			chromeMajor: "146",
			chromeFullVersion: "146.0.7680.165",
			platformVersion: "16.3.0",
			architecture: "arm",
			bitness: "64",
		});

		const [fn] = addInitScript.mock.calls[0];
		const source = fn.toString();
		// The old approach set own toString on each getter — detectable
		expect(source).not.toContain("getter.toString =");
		expect(source).not.toContain("f.toString =");
	});

	test("init script includes chrome.runtime stub", async () => {
		const addInitScript = mock(() => Promise.resolve());
		const context = { addInitScript } as never;

		await applyStealthScripts(context, {
			userAgent: "Mozilla/5.0 Chrome/146.0.7680.165",
			navigatorPlatform: "MacIntel",
			chromeMajor: "146",
			chromeFullVersion: "146.0.7680.165",
			platformVersion: "16.3.0",
			architecture: "arm",
			bitness: "64",
		});

		const [fn] = addInitScript.mock.calls[0];
		const source = fn.toString();
		// Bun's toString may rename variables, so check for the runtime stub's signature
		expect(source).toContain("runtime");
		expect(source).toContain("sendMessage");
		expect(source).toContain("Receiving end does not exist");
	});

	test("init script includes screen.availHeight patch", async () => {
		const addInitScript = mock(() => Promise.resolve());
		const context = { addInitScript } as never;

		await applyStealthScripts(context, {
			userAgent: "Mozilla/5.0 Chrome/146.0.7680.165",
			navigatorPlatform: "MacIntel",
			chromeMajor: "146",
			chromeFullVersion: "146.0.7680.165",
			platformVersion: "16.3.0",
			architecture: "arm",
			bitness: "64",
		});

		const [fn] = addInitScript.mock.calls[0];
		const source = fn.toString();
		expect(source).toContain("availHeight");
	});

	test("passes chromeFullVersion for HEV fullVersionList", async () => {
		const addInitScript = mock(() => Promise.resolve());
		const context = { addInitScript } as never;

		await applyStealthScripts(context, {
			userAgent: "Mozilla/5.0 Chrome/146.0.7680.165",
			navigatorPlatform: "MacIntel",
			chromeMajor: "146",
			chromeFullVersion: "146.0.7680.165",
			platformVersion: "16.3.0",
			architecture: "arm",
			bitness: "64",
		});

		const [, args] = addInitScript.mock.calls[0];
		expect(args.chromeFullVersion).toBe("146.0.7680.165");
	});
});
