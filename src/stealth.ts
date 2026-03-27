import { existsSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { dirname, join } from "node:path";
import type { BrowserContext } from "playwright";

/**
 * Platform mapping for consistent fingerprinting.
 * Maps Node.js `process.platform` to the values browsers expose.
 */
function getNavigatorPlatform(): string {
	switch (platform()) {
		case "win32":
			return "Win32";
		case "darwin":
			return "MacIntel";
		default:
			return "Linux x86_64";
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
 * Derive high-entropy platform values from the host OS.
 */
function getHighEntropyDefaults(): {
	platformVersion: string;
	architecture: string;
	bitness: string;
} {
	const cpuArch = arch() === "arm64" ? "arm" : "x86";

	let platformVersion: string;
	const plat = platform();
	if (plat === "darwin") {
		// macOS kernel-to-version lookup: Darwin 25.x → macOS 16, 24.x → 15, etc.
		const kernelMajor = Number.parseInt(release().split(".")[0] ?? "0", 10);
		const macOSLookup: Record<number, string> = {
			25: "16",
			24: "15",
			23: "14",
			22: "13",
			21: "12",
			20: "11",
		};
		const macOSMajor = macOSLookup[kernelMajor] ?? `${kernelMajor - 9}`;
		platformVersion = `${macOSMajor}.3.0`;
	} else if (plat === "win32") {
		platformVersion = "15.0.0";
	} else {
		platformVersion = "6.5.0";
	}

	return { platformVersion, architecture: cpuArch, bitness: "64" };
}

/**
 * Detect the installed Chrome version by running the binary with --version.
 * Returns the full version string (e.g. "146.0.7680.81").
 */
async function detectChromeVersion(channel: string): Promise<string | null> {
	const { execSync } = await import("node:child_process");
	const chromePaths: Record<string, string[]> = {
		chrome: [
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"google-chrome",
			"google-chrome-stable",
		],
	};
	const candidates = chromePaths[channel] ?? [channel];
	for (const bin of candidates) {
		try {
			const output = execSync(`"${bin}" --version 2>/dev/null`, {
				encoding: "utf-8",
				timeout: 5000,
			}).trim();
			const match = output.match(/(\d+\.\d+\.\d+\.\d+)/);
			if (match) return match[1];
		} catch {
			// Try next candidate
		}
	}
	return null;
}

/**
 * Build the stealth UA string from the installed Chrome version.
 * Falls back to CDP detection if the binary version can't be determined.
 */
export async function buildStealthUA(
	channel: string,
	context?: BrowserContext,
): Promise<StealthOpts> {
	const navigatorPlatform = getNavigatorPlatform();
	const { platformVersion, architecture, bitness } = getHighEntropyDefaults();

	const fullVersion = await detectChromeVersion(channel);
	let userAgent: string;

	if (fullVersion) {
		// Build UA from the installed Chrome version
		const osInfo =
			navigatorPlatform === "MacIntel"
				? "Macintosh; Intel Mac OS X 10_15_7"
				: navigatorPlatform === "Win32"
					? "Windows NT 10.0; Win64; x64"
					: "X11; Linux x86_64";
		userAgent = `Mozilla/5.0 (${osInfo}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVersion} Safari/537.36`;
	} else if (context) {
		// Fallback: detect via CDP after launch
		const page = context.pages()[0];
		if (!page) throw new Error("No page available for UA detection");
		const cdp = await context.newCDPSession(page);
		const { userAgent: rawUA } = (await cdp.send("Browser.getVersion")) as {
			userAgent: string;
		};
		await cdp.detach();
		userAgent = rawUA.replace("HeadlessChrome", "Chrome");
	} else {
		throw new Error("Cannot determine Chrome version");
	}

	const chromeMajor = extractChromeVersion(userAgent);

	return {
		userAgent,
		navigatorPlatform,
		chromeMajor,
		platformVersion,
		architecture,
		bitness,
	};
}

export type StealthOpts = {
	userAgent: string;
	navigatorPlatform: string;
	chromeMajor: string;
	platformVersion: string;
	architecture: string;
	bitness: string;
};

/**
 * Apply stealth patches to a browser context via addInitScript.
 * This is a fallback for non-persistent contexts (isolated sessions).
 * The primary patching is done by the stealth-worker-fix extension.
 *
 * Uses per-function toString spoofing (not a global override) to avoid
 * CreepJS detecting modifications across all prototype properties.
 */
export async function applyStealthScripts(
	context: BrowserContext,
	opts: StealthOpts,
): Promise<void> {
	await context.addInitScript(
		({
			userAgent,
			navigatorPlatform,
			chromeMajor,
			platformVersion,
			architecture,
			bitness,
		}) => {
			const nativeToString = Function.prototype.toString;

			// Spoof toString on individual functions without overriding
			// Function.prototype.toString globally.
			function makeNativeGetter(
				name: string,
				valueFn: () => unknown,
			): () => unknown {
				const getter = function (this: unknown) {
					return valueFn();
				};
				getter.toString = () => `function get ${name}() { [native code] }`;
				getter.toString.toString = nativeToString.bind(nativeToString);
				return getter;
			}

			function makeNativeFunction<T extends Function>(name: string, fn: T): T {
				(fn as Function & { toString: () => string }).toString = () =>
					`function ${name}() { [native code] }`;
				(
					fn as Function & { toString: Function & { toString: () => string } }
				).toString.toString = nativeToString.bind(nativeToString);
				return fn;
			}

			// 1. navigator.webdriver → false
			Object.defineProperty(Navigator.prototype, "webdriver", {
				get: makeNativeGetter("webdriver", () => false),
				configurable: true,
			});

			// 2. navigator.userAgentData (Chromium ≥90)
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

				const allHighEntropy: Record<string, unknown> = {
					brands,
					fullVersionList,
					mobile: false,
					platform: uaDataPlatform,
					platformVersion,
					architecture,
					bitness,
					model: "",
					uaFullVersion: `${chromeMajor}.0.0.0`,
					wow64: false,
				};

				const ghev = makeNativeFunction(
					"getHighEntropyValues",
					function getHighEntropyValues(
						hints?: string[],
					): Promise<Record<string, unknown>> {
						if (!hints || hints.length === 0) {
							return Promise.resolve({ ...allHighEntropy });
						}
						const result: Record<string, unknown> = {
							brands,
							mobile: false,
							platform: uaDataPlatform,
						};
						for (const hint of hints) {
							if (hint in allHighEntropy) {
								result[hint] = allHighEntropy[hint];
							}
						}
						return Promise.resolve(result);
					},
				);

				const toJSON = makeNativeFunction(
					"toJSON",
					// biome-ignore lint/complexity/useArrowFunction: must be named
					function toJSON() {
						return { brands, mobile: false, platform: uaDataPlatform };
					},
				);

				const fakeUAData = {
					brands,
					mobile: false,
					platform: uaDataPlatform,
					getHighEntropyValues: ghev,
					toJSON,
				};

				Object.defineProperty(Navigator.prototype, "userAgentData", {
					get: makeNativeGetter("userAgentData", () => fakeUAData),
					configurable: true,
				});
			}

			// 3. navigator.userAgent
			Object.defineProperty(Navigator.prototype, "userAgent", {
				get: makeNativeGetter("userAgent", () => userAgent),
				configurable: true,
			});
		},
		opts,
	);
}

/**
 * Resolve the path to a bundled Chrome extension by name.
 * Works both in development (src/) and when compiled (dist/).
 */
function resolveExtensionDir(name: string): string | null {
	const candidates = [
		join(dirname(process.argv[1] ?? __dirname), "extensions", name),
		join(__dirname, "..", "extensions", name),
	];
	for (const dir of candidates) {
		if (existsSync(join(dir, "manifest.json"))) return dir;
	}
	return null;
}

/**
 * Build Chromium launch arguments with stealth flags and extensions:
 * - screenxy-fix: patches CDP mouse coordinate leak in cross-origin iframes
 * - stealth-worker-fix: patches SharedWorker/ServiceWorker UA leak
 */
export function stealthArgs(userAgent?: string): string[] {
	const args: string[] = [];

	// Set UA at the Chromium process level so ALL contexts — including
	// ServiceWorkers and SharedWorkers — see the clean UA string.
	// This is distinct from Playwright's userAgent option (HTTP headers only)
	// and CDP Emulation.setUserAgentOverride (page/dedicated workers only).
	if (userAgent) {
		args.push(`--user-agent=${userAgent}`);
	}

	const extNames = ["screenxy-fix", "stealth-worker-fix"];
	const extDirs: string[] = [];
	for (const name of extNames) {
		const dir = resolveExtensionDir(name);
		if (dir) extDirs.push(dir);
	}

	if (extDirs.length > 0) {
		args.push(`--disable-extensions-except=${extDirs.join(",")}`);
		args.push(`--load-extension=${extDirs.join(",")}`);
	}

	return args;
}
