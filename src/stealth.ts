import { existsSync } from "node:fs";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import type { BrowserContext } from "playwright";
import UserAgent from "user-agents";

/**
 * Platform mapping for consistent fingerprinting.
 * Maps Node.js `process.platform` to the values browsers expose.
 */
function getPlatformFilter(): { uaRegex: RegExp; navigatorPlatform: string } {
	switch (platform()) {
		case "win32":
			return { uaRegex: /Windows.*Chrome/, navigatorPlatform: "Win32" };
		case "darwin":
			return { uaRegex: /Macintosh.*Chrome/, navigatorPlatform: "MacIntel" };
		default:
			return { uaRegex: /Linux.*Chrome/, navigatorPlatform: "Linux x86_64" };
	}
}

/**
 * Extract the Chrome major version from a user-agent string.
 * Returns "0" if not found.
 */
function extractChromeVersion(ua: string): string {
	const match = ua.match(/Chrome\/(\d+)/);
	return match?.[1] ?? "0";
}

/**
 * Generate a desktop Chrome user-agent string that matches the host OS.
 */
export function generateUserAgent(): {
	userAgent: string;
	navigatorPlatform: string;
	chromeMajor: string;
} {
	const { uaRegex, navigatorPlatform } = getPlatformFilter();

	const ua = new UserAgent({
		deviceCategory: "desktop",
		userAgent: uaRegex,
		platform: navigatorPlatform,
	}).toString();

	return {
		userAgent: ua,
		navigatorPlatform,
		chromeMajor: extractChromeVersion(ua),
	};
}

/**
 * Apply stealth patches to a browser context:
 * 1. Patch navigator.webdriver → undefined
 * 2. Override navigator.userAgentData brands to match the spoofed UA version
 * 3. Override high-entropy userAgentData to suppress HeadlessChrome
 */
export async function applyStealthScripts(
	context: BrowserContext,
	opts: { userAgent: string; navigatorPlatform: string; chromeMajor: string },
): Promise<void> {
	await context.addInitScript(
		({ userAgent, navigatorPlatform, chromeMajor }) => {
			// 1. Set navigator.webdriver to false on the prototype (where it
			// naturally lives). Defining it as an own property on `navigator`
			// is detectable via Object.getOwnPropertyNames(navigator).
			Object.defineProperty(Navigator.prototype, "webdriver", {
				get: () => false,
				configurable: true,
			});

			// 2. Patch navigator.userAgentData (Chromium ≥90)
			// The native NavigatorUAData object is frozen, so we replace the
			// entire navigator.userAgentData getter with a plain object that
			// returns consistent brands/version/platform.
			if ("userAgentData" in navigator) {
				const uaDataPlatform =
					navigatorPlatform === "MacIntel"
						? "macOS"
						: navigatorPlatform === "Win32"
							? "Windows"
							: "Linux";

				const brands = [
					{ brand: "Chromium", version: chromeMajor },
					{ brand: "Google Chrome", version: chromeMajor },
					{ brand: "Not-A.Brand", version: "8" },
				];

				const fullVersionList = [
					{ brand: "Chromium", version: `${chromeMajor}.0.0.0` },
					{
						brand: "Google Chrome",
						version: `${chromeMajor}.0.0.0`,
					},
					{ brand: "Not-A.Brand", version: "8.0.0.0" },
				];

				const fakeUAData = {
					brands,
					mobile: false,
					platform: uaDataPlatform,
					getHighEntropyValues: async () => ({
						brands,
						fullVersionList,
						mobile: false,
						platform: uaDataPlatform,
						uaFullVersion: `${chromeMajor}.0.0.0`,
					}),
					toJSON: () => ({
						brands,
						mobile: false,
						platform: uaDataPlatform,
					}),
				};

				// Define on prototype to avoid adding own properties to
				// navigator (detectable via Object.getOwnPropertyNames).
				Object.defineProperty(Navigator.prototype, "userAgentData", {
					get: () => fakeUAData,
					configurable: true,
				});
			}

			// 3. Ensure navigator.userAgent matches (belt-and-braces)
			Object.defineProperty(Navigator.prototype, "userAgent", {
				get: () => userAgent,
				configurable: true,
			});
		},
		opts,
	);
}

/**
 * Resolve the path to the bundled screenxy-fix Chrome extension.
 * Works both in development (src/) and when compiled (dist/).
 */
function resolveExtensionDir(): string | null {
	// When compiled, __dirname is the binary's directory
	const candidates = [
		join(dirname(process.argv[1] ?? __dirname), "extensions", "screenxy-fix"),
		join(__dirname, "..", "extensions", "screenxy-fix"),
	];
	for (const dir of candidates) {
		if (existsSync(join(dir, "manifest.json"))) return dir;
	}
	return null;
}

/**
 * Build Chromium launch arguments with stealth flags and the
 * screenxy-fix extension (patches CDP mouse coordinate leak in
 * cross-origin iframes used by Cloudflare Turnstile).
 */
export function stealthArgs(): string[] {
	const args = ["--disable-blink-features=AutomationControlled"];

	const extDir = resolveExtensionDir();
	if (extDir) {
		args.push(`--disable-extensions-except=${extDir}`);
		args.push(`--load-extension=${extDir}`);
	}

	return args;
}

// Type for NavigatorUAData (not in all TS libs)
interface NavigatorUABrandVersion {
	brand: string;
	version: string;
}

interface NavigatorUAData {
	brands: NavigatorUABrandVersion[];
	mobile: boolean;
	platform: string;
	getHighEntropyValues: (hints: string[]) => Promise<HighEntropyValues>;
}

interface HighEntropyValues {
	brands: NavigatorUABrandVersion[];
	fullVersionList: NavigatorUABrandVersion[];
	mobile: boolean;
	platform: string;
	uaFullVersion?: string;
	[key: string]: unknown;
}
