import { devices, type Page } from "playwright";
import type { Response } from "../protocol.ts";
import { handleSnapshot } from "./snapshot.ts";
import { PRESETS, type ViewportParsedArgs } from "./viewport.ts";

/**
 * Parse viewport-related flags from goto args.
 * Returns the viewport config (if any), the URL, and any parse errors.
 */
function parseGotoArgs(args: string[]): {
	url: string | undefined;
	viewport: ViewportParsedArgs | null;
} {
	let device: string | undefined;
	let preset: string | undefined;
	let viewportSize: string | undefined;
	const positional: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--device") {
			device = args[++i];
		} else if (arg === "--preset") {
			preset = args[++i];
		} else if (arg === "--viewport") {
			viewportSize = args[++i];
		} else if (arg === "--auto-snapshot") {
			// Handled by the caller, skip
		} else if (!arg.startsWith("--")) {
			positional.push(arg);
		}
	}

	const url = positional[0];

	// No viewport flags — no viewport change
	if (!device && !preset && !viewportSize) {
		return { url, viewport: null };
	}

	// Mutual exclusivity
	const flagCount = [device, preset, viewportSize].filter(Boolean).length;
	if (flagCount > 1) {
		return {
			url,
			viewport: {
				error: "--viewport, --device, and --preset are mutually exclusive.",
			},
		};
	}

	if (device) {
		const descriptor = devices[device];
		if (!descriptor?.viewport) {
			return { url, viewport: { error: `Unknown device: "${device}".` } };
		}
		return {
			url,
			viewport: {
				action: "set",
				width: descriptor.viewport.width,
				height: descriptor.viewport.height,
				label: device,
			},
		};
	}

	if (preset) {
		const size = PRESETS[preset];
		if (!size) {
			const valid = Object.keys(PRESETS).join(", ");
			return {
				url,
				viewport: {
					error: `Unknown preset: "${preset}". Valid presets: ${valid}.`,
				},
			};
		}
		return { url, viewport: { action: "set", ...size, label: preset } };
	}

	// --viewport WxH
	if (viewportSize) {
		const match = viewportSize.match(/^(\d+)[xX](\d+)$/);
		if (!match) {
			return {
				url,
				viewport: { error: "Expected WxH format (e.g. 320x568)." },
			};
		}
		const width = Number(match[1]);
		const height = Number(match[2]);
		if (width <= 0 || height <= 0) {
			return {
				url,
				viewport: { error: "Width and height must be positive integers." },
			};
		}
		return { url, viewport: { action: "set", width, height } };
	}

	return { url, viewport: null };
}

export async function handleGoto(
	page: Page,
	args: string[],
	options?: { autoSnapshot?: boolean },
): Promise<Response> {
	const { url, viewport } = parseGotoArgs(args);

	if (!url) {
		return { ok: false, error: "Usage: browse goto <url>" };
	}

	if (viewport && "error" in viewport) {
		return { ok: false, error: viewport.error };
	}

	try {
		// Resize viewport before navigating
		if (viewport && viewport.action === "set") {
			await page.setViewportSize({
				width: viewport.width,
				height: viewport.height,
			});
		}

		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

		// Inject stealth patches to fix CreepJS detection.
		// This runs on every navigation since addInitScript only affects new pages.
		try {
			await page.evaluate(() => {
				// Only inject once per page
				if ((window as Record<string, unknown>).__stealthGotoInjected) return;
				(window as Record<string, unknown>).__stealthGotoInjected = true;

				// WeakMap-based toString spoofing
				const toStringMap = new WeakMap<(...args: never) => unknown, string>();
				const originalToString = Function.prototype.toString;
				const patchedToString = function toStringPatch(this: unknown) {
					const spoofed = toStringMap.get(this as () => unknown);
					if (spoofed !== undefined) return spoofed;
					return originalToString.call(this);
				};
				toStringMap.set(
					patchedToString,
					"function toString() { [native code] }",
				);
				Function.prototype.toString = patchedToString;

				// Override getComputedStyle to fix ActiveText
				const originalGetComputedStyle = window.getComputedStyle;
				window.getComputedStyle = function getComputedStyle(
					elem: Element,
					pseudoElt?: string | null,
				) {
					const style = originalGetComputedStyle.call(window, elem, pseudoElt);
					if (elem instanceof HTMLElement) {
						const inlineBg = elem.style.backgroundColor;
						const elemStyle = elem.getAttribute("style");
						if (
							inlineBg.toLowerCase() === "activetext" ||
							elemStyle?.includes("ActiveText")
						) {
							return new Proxy(style, {
								get(target, prop) {
									if (prop === "backgroundColor") {
										return "rgb(0, 0, 0)";
									}
									return (target as Record<string | symbol, unknown>)[prop];
								},
							});
						}
					}
					return style;
				};
				toStringMap.set(
					window.getComputedStyle,
					"function getComputedStyle() { [native code] }",
				);
			});
		} catch {
			// Injection may fail on some pages (e.g., about:blank)
		}

		const title = await page.title();

		let result: string;
		if (viewport && viewport.action === "set") {
			const suffix = viewport.label ? ` (${viewport.label})` : "";
			result = `${title} [${viewport.width}x${viewport.height}${suffix}]`;
		} else {
			result = title;
		}

		// Auto-snapshot: refresh refs so agent can immediately interact
		if (options?.autoSnapshot) {
			const snapshotResult = await handleSnapshot(page, []);
			if (snapshotResult.ok) {
				return { ok: true, data: `${result}\n\n${snapshotResult.data}` };
			}
		}

		return { ok: true, data: result };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
