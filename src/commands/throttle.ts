import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

type ThrottlePreset = {
	name: string;
	download: number; // bytes/sec
	upload: number; // bytes/sec
	latency: number; // ms
};

const PRESETS: Record<string, ThrottlePreset> = {
	"slow-3g": {
		name: "Slow 3G",
		download: 50 * 1024,
		upload: 25 * 1024,
		latency: 2000,
	},
	"3g": { name: "3G", download: 187 * 1024, upload: 75 * 1024, latency: 400 },
	"4g": { name: "4G", download: 1500 * 1024, upload: 750 * 1024, latency: 60 },
	wifi: {
		name: "WiFi",
		download: 3750 * 1024,
		upload: 1500 * 1024,
		latency: 20,
	},
	cable: {
		name: "Cable",
		download: 6250 * 1024,
		upload: 3125 * 1024,
		latency: 5,
	},
};

// Module-level state for current throttle
let currentThrottle: {
	preset?: string;
	download: number;
	upload: number;
	latency: number;
} | null = null;

export function getCurrentThrottle() {
	return currentThrottle;
}

export async function handleThrottle(
	page: Page,
	args: string[],
): Promise<Response> {
	if (args.length === 0) {
		return {
			ok: false,
			error:
				"Usage: browse throttle <preset|off|status> [--download KB/s] [--upload KB/s] [--latency ms]\n\nPresets: slow-3g, 3g, 4g, wifi, cable",
		};
	}

	const sub = args[0];

	if (sub === "status") {
		if (!currentThrottle) return { ok: true, data: "Throttle: off" };
		const dl = Math.round(currentThrottle.download / 1024);
		const ul = Math.round(currentThrottle.upload / 1024);
		return {
			ok: true,
			data: `Throttle: ${currentThrottle.preset ?? "custom"} (${dl} KB/s ↓, ${ul} KB/s ↑, ${currentThrottle.latency}ms latency)`,
		};
	}

	if (sub === "off") {
		// Get CDP session and disable throttling
		try {
			const cdp = await page.context().newCDPSession(page);
			await cdp.send("Network.emulateNetworkConditions", {
				offline: false,
				downloadThroughput: -1,
				uploadThroughput: -1,
				latency: 0,
			});
			await cdp.detach();
			currentThrottle = null;
			return { ok: true, data: "Throttle: disabled" };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (
				message.includes("Target does not support") ||
				message.includes("Protocol error") ||
				message.includes("newCDPSession")
			) {
				return { ok: false, error: "Network throttling requires Chromium." };
			}
			return { ok: false, error: `Failed to disable throttle: ${message}` };
		}
	}

	// Check for preset or custom flags
	let download: number;
	let upload: number;
	let latency: number;
	let presetName: string | undefined;

	if (PRESETS[sub]) {
		const preset = PRESETS[sub];
		download = preset.download;
		upload = preset.upload;
		latency = preset.latency;
		presetName = sub;
	} else if (sub === "--download" || args.includes("--download")) {
		// Custom values
		download = parseNumericFlag(args, "--download", 500) * 1024;
		upload = parseNumericFlag(args, "--upload", 100) * 1024;
		latency = parseNumericFlag(args, "--latency", 0);
	} else {
		return {
			ok: false,
			error: `Unknown throttle preset: "${sub}". Available: ${Object.keys(PRESETS).join(", ")}`,
		};
	}

	try {
		const cdp = await page.context().newCDPSession(page);
		await cdp.send("Network.emulateNetworkConditions", {
			offline: false,
			downloadThroughput: download,
			uploadThroughput: upload,
			latency,
		});
		await cdp.detach();
		currentThrottle = { preset: presetName, download, upload, latency };
		const dl = Math.round(download / 1024);
		const ul = Math.round(upload / 1024);
		return {
			ok: true,
			data: `Throttle: ${presetName ?? "custom"} (${dl} KB/s ↓, ${ul} KB/s ↑, ${latency}ms latency)`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (
			message.includes("Target does not support") ||
			message.includes("Protocol error") ||
			message.includes("newCDPSession")
		) {
			return { ok: false, error: "Network throttling requires Chromium." };
		}
		return { ok: false, error: `Failed to set throttle: ${message}` };
	}
}

function parseNumericFlag(
	args: string[],
	flag: string,
	defaultValue: number,
): number {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return defaultValue;
	const val = Number.parseInt(args[idx + 1], 10);
	return Number.isNaN(val) ? defaultValue : val;
}
