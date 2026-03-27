import { describe, expect, mock, test } from "bun:test";
import { applyStealthScripts, stealthArgs } from "../src/stealth.ts";

describe("stealthArgs", () => {
	test("returns an array of launch args", () => {
		const args = stealthArgs();
		expect(Array.isArray(args)).toBe(true);
	});

	test("loads stealth-worker-fix extension when available", () => {
		const args = stealthArgs();
		const extArg = args.find((a) => a.startsWith("--load-extension="));
		// In the dev environment, extensions/ should be found
		if (extArg) {
			expect(extArg).toContain("stealth-worker-fix");
		}
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
