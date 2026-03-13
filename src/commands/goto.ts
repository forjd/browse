import { devices, type Page } from "playwright";
import type { Response } from "../protocol.ts";
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
		const title = await page.title();

		if (viewport && viewport.action === "set") {
			const suffix = viewport.label ? ` (${viewport.label})` : "";
			return {
				ok: true,
				data: `${title} [${viewport.width}x${viewport.height}${suffix}]`,
			};
		}

		return { ok: true, data: title };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
