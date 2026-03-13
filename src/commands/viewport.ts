import { devices, type Page } from "playwright";
import type { Response } from "../protocol.ts";

export const PRESETS: Record<string, { width: number; height: number }> = {
	mobile: { width: 375, height: 667 },
	tablet: { width: 768, height: 1024 },
	desktop: { width: 1440, height: 900 },
};

export type ViewportParsedArgs =
	| { action: "show" }
	| { action: "set"; width: number; height: number; label?: string }
	| { error: string };

export function parseViewportArgs(args: string[]): ViewportParsedArgs {
	let device: string | undefined;
	let preset: string | undefined;
	const positional: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--device") {
			const next = args[i + 1];
			if (!next || next.startsWith("--")) {
				return { error: "Missing value for --device." };
			}
			device = next;
			i++;
		} else if (arg === "--preset") {
			const next = args[i + 1];
			if (!next || next.startsWith("--")) {
				return { error: "Missing value for --preset." };
			}
			preset = next;
			i++;
		} else if (!arg.startsWith("--")) {
			positional.push(arg);
		}
	}

	if (device && preset) {
		return { error: "--device and --preset are mutually exclusive." };
	}

	if (device) {
		const descriptor = devices[device];
		if (!descriptor?.viewport) {
			return { error: `Unknown device: "${device}".` };
		}
		return {
			action: "set",
			width: descriptor.viewport.width,
			height: descriptor.viewport.height,
			label: device,
		};
	}

	if (preset) {
		const size = PRESETS[preset];
		if (!size) {
			const valid = Object.keys(PRESETS).join(", ");
			return { error: `Unknown preset: "${preset}". Valid presets: ${valid}.` };
		}
		return { action: "set", ...size, label: preset };
	}

	if (positional.length === 0) {
		return { action: "show" };
	}

	// Try WxH format
	if (positional.length === 1) {
		const match = positional[0].match(/^(\d+)[xX](\d+)$/);
		if (match) {
			const width = Number(match[1]);
			const height = Number(match[2]);
			if (width > 0 && height > 0) {
				return { action: "set", width, height };
			}
			return { error: "Width and height must be positive integers." };
		}
		return { error: "Expected WxH format or separate width and height." };
	}

	const width = Number(positional[0]);
	const height = Number(positional[1]);

	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width <= 0 ||
		height <= 0
	) {
		return { error: "Width and height must be positive integers." };
	}

	return { action: "set", width, height };
}

export async function handleViewport(
	page: Page,
	args: string[],
): Promise<Response> {
	const parsed = parseViewportArgs(args);

	if ("error" in parsed) {
		return { ok: false, error: parsed.error };
	}

	if (parsed.action === "show") {
		const size = page.viewportSize();
		if (!size) {
			return { ok: false, error: "No viewport size available." };
		}
		return { ok: true, data: `${size.width}x${size.height}` };
	}

	const { width, height, label } = parsed;
	await page.setViewportSize({ width, height });
	const suffix = label ? ` (${label})` : "";
	return { ok: true, data: `Viewport set to ${width}x${height}${suffix}` };
}
