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
 * Extract the full Chrome version (e.g. "146.0.7680.165") from a user-agent string.
 * Falls back to "major.0.0.0" if the full version can't be parsed.
 */
function extractChromeFullVersion(ua: string): string {
	const match = ua.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
	if (match) return match[1];
	const major = extractChromeVersion(ua);
	return `${major}.0.0.0`;
}

/**
 * Derive high-entropy platform values from the host OS.
 */
export function getHighEntropyDefaults(): {
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
	const chromeFullVersion = extractChromeFullVersion(userAgent);

	return {
		userAgent,
		navigatorPlatform,
		chromeMajor,
		chromeFullVersion,
		platformVersion,
		architecture,
		bitness,
	};
}

export type StealthOpts = {
	userAgent: string;
	navigatorPlatform: string;
	chromeMajor: string;
	chromeFullVersion: string;
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
			chromeFullVersion,
			platformVersion,
			architecture,
			bitness,
		}) => {
			// WeakMap-based toString spoofing — no own properties on functions,
			// so hasOwnProperty('toString') returns false (matching native).
			// biome-ignore lint/complexity/noBannedTypes: WeakMap key must be Function
			const toStringMap = new WeakMap<Function, string>();
			const originalToString = Function.prototype.toString;
			// biome-ignore lint/suspicious/noShadowRestrictedNames: must match native Function.prototype.toString name
			const patchedToString = function toString(
				this: (...args: unknown[]) => unknown,
			): string {
				const spoofed = toStringMap.get(this);
				if (spoofed !== undefined) return spoofed;
				return originalToString.call(this);
			};
			toStringMap.set(patchedToString, "function toString() { [native code] }");
			Function.prototype.toString = patchedToString;

			function makeNativeGetter(
				name: string,
				proto: object,
				valueFn: () => unknown,
			): () => unknown {
				const getter = function (this: unknown) {
					// Reject non-objects (primitives, null, undefined)
					if (
						this == null ||
						(typeof this !== "object" && typeof this !== "function")
					) {
						throw new TypeError("Illegal invocation");
					}
					// Walk the prototype chain to check if proto is an ancestor,
					// matching native getter behaviour without relying on instanceof
					// (which can fail across extension/page execution contexts).
					let p = Object.getPrototypeOf(this);
					while (p !== null) {
						if (p === proto) return valueFn();
						p = Object.getPrototypeOf(p);
					}
					throw new TypeError("Illegal invocation");
				};
				toStringMap.set(getter, `function get ${name}() { [native code] }`);
				return getter;
			}

			function makeNativeFunction<
				// biome-ignore lint/complexity/noBannedTypes: generic bound for callable values
				T extends Function,
			>(name: string, fn: T): T {
				toStringMap.set(fn, `function ${name}() { [native code] }`);
				return fn;
			}

			// 1. Remove Playwright globals that fpscanner detects
			try {
				delete (globalThis as Record<string, unknown>).__pwInitScripts;
			} catch {}
			try {
				delete (globalThis as Record<string, unknown>).__playwright__binding__;
			} catch {}

			// 2. chrome.app stub — headless Chrome may be missing it
			if (typeof chrome !== "undefined") {
				const chromeAny = chrome as Record<string, unknown>;
				if (!chromeAny.app) {
					chromeAny.app = {};
				}
				const app = chromeAny.app as Record<string, unknown>;
				if (!("isInstalled" in app)) app.isInstalled = false;
				if (!("getDetails" in app))
					app.getDetails = makeNativeFunction(
						"getDetails",
						function getDetails() {
							return null;
						},
					);
				if (!("getIsInstalled" in app))
					app.getIsInstalled = makeNativeFunction(
						"getIsInstalled",
						function getIsInstalled() {
							return false;
						},
					);
				if (!("installState" in app))
					app.installState = makeNativeFunction(
						"installState",
						function installState(callback: (state: string) => void) {
							if (callback) callback("disabled");
						},
					);
				if (!("runningState" in app))
					app.runningState = makeNativeFunction(
						"runningState",
						function runningState() {
							return "cannot_run";
						},
					);
			}

			// 3. navigator.webdriver → false
			Object.defineProperty(Navigator.prototype, "webdriver", {
				get: makeNativeGetter("webdriver", Navigator.prototype, () => false),
				configurable: true,
			});

			// 3. navigator.userAgentData (Chromium ≥90)
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
					{ brand: "Chromium", version: chromeFullVersion },
					{
						brand: "Google Chrome",
						version: chromeFullVersion,
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
					uaFullVersion: chromeFullVersion,
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

				const toJSON = makeNativeFunction("toJSON", function toJSON() {
					return { brands, mobile: false, platform: uaDataPlatform };
				});

				const fakeUAData = {
					brands,
					mobile: false,
					platform: uaDataPlatform,
					getHighEntropyValues: ghev,
					toJSON,
				};

				// Set prototype so instanceof NavigatorUAData returns true
				if (typeof NavigatorUAData !== "undefined") {
					Object.setPrototypeOf(fakeUAData, NavigatorUAData.prototype);
				}

				Object.defineProperty(Navigator.prototype, "userAgentData", {
					get: makeNativeGetter(
						"userAgentData",
						Navigator.prototype,
						() => fakeUAData,
					),
					configurable: true,
				});
			}

			// 4. navigator.userAgent
			Object.defineProperty(Navigator.prototype, "userAgent", {
				get: makeNativeGetter(
					"userAgent",
					Navigator.prototype,
					() => userAgent,
				),
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

	// Disable the Blink AutomationControlled feature. This prevents the
	// engine from setting navigator.webdriver = true at the C++ level,
	// covering all execution contexts (main, workers, iframes) without
	// needing JS-level prototype patching for this property.
	args.push("--disable-blink-features=AutomationControlled");

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
