import { describe, expect, mock, test } from "bun:test";
import { platform } from "node:os";
import {
	applyStealthScripts,
	generateUserAgent,
	stealthArgs,
} from "../src/stealth.ts";

describe("generateUserAgent", () => {
	test("returns a Chrome user-agent string", () => {
		const { userAgent } = generateUserAgent();
		expect(userAgent).toContain("Chrome/");
		expect(userAgent).toContain("Mozilla/5.0");
	});

	test("user-agent matches the host OS", () => {
		const { userAgent } = generateUserAgent();
		const os = platform();

		if (os === "darwin") {
			expect(userAgent).toContain("Macintosh");
		} else if (os === "win32") {
			expect(userAgent).toContain("Windows");
		} else {
			expect(userAgent).toContain("Linux");
		}
	});

	test("navigatorPlatform matches the host OS", () => {
		const { navigatorPlatform } = generateUserAgent();
		const os = platform();

		if (os === "darwin") {
			expect(navigatorPlatform).toBe("MacIntel");
		} else if (os === "win32") {
			expect(navigatorPlatform).toBe("Win32");
		} else {
			expect(navigatorPlatform).toBe("Linux x86_64");
		}
	});

	test("extracts a valid Chrome major version", () => {
		const { chromeMajor } = generateUserAgent();
		const version = Number(chromeMajor);
		expect(version).toBeGreaterThan(0);
		expect(Number.isInteger(version)).toBe(true);
	});

	test("user-agent contains the extracted Chrome version", () => {
		const { userAgent, chromeMajor } = generateUserAgent();
		expect(userAgent).toContain(`Chrome/${chromeMajor}`);
	});
});

describe("stealthArgs", () => {
	test("includes AutomationControlled disable flag", () => {
		expect(stealthArgs()).toContain(
			"--disable-blink-features=AutomationControlled",
		);
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
		});

		expect(addInitScript).toHaveBeenCalledTimes(1);
		const [fn, args] = addInitScript.mock.calls[0];
		expect(typeof fn).toBe("function");
		expect(args).toEqual({
			userAgent: "Mozilla/5.0 (Macintosh) Chrome/131",
			navigatorPlatform: "MacIntel",
			chromeMajor: "131",
		});
	});
});
