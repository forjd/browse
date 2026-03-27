import { describe, expect, mock, test } from "bun:test";
import { applyStealthScripts, stealthArgs } from "../src/stealth.ts";

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

describe("applyStealthScripts", () => {
	test("calls addInitScript on the context", async () => {
		const addInitScript = mock(() => Promise.resolve());
		const context = { addInitScript } as never;

		await applyStealthScripts(context, {
			userAgent: "Mozilla/5.0 (Macintosh) Chrome/131",
			navigatorPlatform: "MacIntel",
			chromeMajor: "131",
			platformVersion: "15.3.0",
			architecture: "arm",
			bitness: "64",
		});

		expect(addInitScript).toHaveBeenCalledTimes(1);
		const [fn, args] = addInitScript.mock.calls[0];
		expect(typeof fn).toBe("function");
		expect(args).toEqual({
			userAgent: "Mozilla/5.0 (Macintosh) Chrome/131",
			navigatorPlatform: "MacIntel",
			chromeMajor: "131",
			platformVersion: "15.3.0",
			architecture: "arm",
			bitness: "64",
		});
	});
});
