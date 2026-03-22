import { devices as playwrightDevices } from "playwright";
import type { Response } from "../protocol.ts";

type DeviceProfile = {
	viewport: { width: number; height: number };
	deviceScaleFactor: number;
	userAgent: string;
	isMobile: boolean;
	hasTouch: boolean;
};

// Supplement Playwright's built-in devices with commonly searched aliases
const DEVICE_ALIASES: Record<string, string> = {
	"iphone 15": "iPhone 15",
	"iphone 15 pro": "iPhone 15 Pro",
	"iphone 15 pro max": "iPhone 15 Pro Max",
	"iphone 14": "iPhone 14",
	"iphone 13": "iPhone 13",
	"iphone 12": "iPhone 12",
	"iphone se": "iPhone SE",
	"pixel 7": "Pixel 7",
	"pixel 5": "Pixel 5",
	"galaxy s9": "Galaxy S9+",
	"ipad pro": "iPad Pro 11",
	"ipad air": "iPad (gen 7)",
	"ipad mini": "iPad Mini",
};

export async function handleDevices(
	_page: unknown,
	args: string[],
): Promise<Response> {
	if (args.length === 0) {
		return {
			ok: false,
			error: `Usage: browse devices <subcommand>

Subcommands:
  list                  List all available device profiles
  search <query>        Search for a device by name
  info <name>           Show device details

Use with --device flag:
  browse goto https://example.com --device "iPhone 15 Pro"`,
		};
	}

	const sub = args[0];

	switch (sub) {
		case "list": {
			const deviceNames = Object.keys(playwrightDevices).sort();
			const lines = [`Available devices (${deviceNames.length}):`, ""];

			// Group by category
			const phones = deviceNames.filter(
				(d) =>
					d.includes("iPhone") ||
					d.includes("Pixel") ||
					d.includes("Galaxy") ||
					d.includes("Moto") ||
					d.includes("Nokia") ||
					d.includes("Nexus"),
			);
			const tablets = deviceNames.filter(
				(d) => d.includes("iPad") || d.includes("Galaxy Tab"),
			);
			const desktops = deviceNames.filter((d) => d.includes("Desktop"));
			const other = deviceNames.filter(
				(d) =>
					!phones.includes(d) && !tablets.includes(d) && !desktops.includes(d),
			);

			if (phones.length > 0) {
				lines.push("Phones:");
				for (const d of phones.slice(0, 30)) {
					const dev = playwrightDevices[d];
					lines.push(
						`  ${d.padEnd(30)} ${dev.viewport.width}x${dev.viewport.height} @${dev.deviceScaleFactor}x`,
					);
				}
				if (phones.length > 30) {
					lines.push(`  ... and ${phones.length - 30} more`);
				}
				lines.push("");
			}

			if (tablets.length > 0) {
				lines.push("Tablets:");
				for (const d of tablets.slice(0, 15)) {
					const dev = playwrightDevices[d];
					lines.push(
						`  ${d.padEnd(30)} ${dev.viewport.width}x${dev.viewport.height} @${dev.deviceScaleFactor}x`,
					);
				}
				lines.push("");
			}

			if (desktops.length > 0) {
				lines.push("Desktops:");
				for (const d of desktops) {
					const dev = playwrightDevices[d];
					lines.push(
						`  ${d.padEnd(30)} ${dev.viewport.width}x${dev.viewport.height}`,
					);
				}
				lines.push("");
			}

			if (other.length > 0) {
				lines.push("Other:");
				for (const d of other.slice(0, 10)) {
					const dev = playwrightDevices[d];
					lines.push(
						`  ${d.padEnd(30)} ${dev.viewport.width}x${dev.viewport.height}`,
					);
				}
				lines.push("");
			}

			return { ok: true, data: lines.join("\n") };
		}

		case "search": {
			const query = args.slice(1).join(" ").toLowerCase();
			if (!query) {
				return {
					ok: false,
					error: 'Usage: browse devices search <query> (e.g., "iphone")',
				};
			}

			const matches = Object.keys(playwrightDevices).filter((d) =>
				d.toLowerCase().includes(query),
			);

			if (matches.length === 0) {
				// Check aliases
				const alias = DEVICE_ALIASES[query];
				if (alias && playwrightDevices[alias]) {
					return {
						ok: true,
						data: `Found via alias: ${alias}\n  Use: --device "${alias}"`,
					};
				}
				return {
					ok: true,
					data: `No devices matching "${query}"`,
				};
			}

			const lines = [`Found ${matches.length} device(s):`];
			for (const d of matches.slice(0, 20)) {
				const dev = playwrightDevices[d];
				lines.push(
					`  ${d.padEnd(30)} ${dev.viewport.width}x${dev.viewport.height} @${dev.deviceScaleFactor}x ${dev.isMobile ? "(mobile)" : ""}`,
				);
			}
			if (matches.length > 20) {
				lines.push(`  ... and ${matches.length - 20} more`);
			}

			return { ok: true, data: lines.join("\n") };
		}

		case "info": {
			const name = args.slice(1).join(" ");
			if (!name) {
				return {
					ok: false,
					error: 'Usage: browse devices info <name> (e.g., "iPhone 15 Pro")',
				};
			}

			// Try direct match first, then alias
			let device = playwrightDevices[name];
			let resolvedName = name;
			if (!device) {
				const alias = DEVICE_ALIASES[name.toLowerCase()];
				if (alias) {
					device = playwrightDevices[alias];
					resolvedName = alias;
				}
			}

			if (!device) {
				return {
					ok: false,
					error: `Device "${name}" not found. Use "browse devices search ${name}" to find similar devices.`,
				};
			}

			const lines = [
				`Device: ${resolvedName}`,
				`  Viewport: ${device.viewport.width}x${device.viewport.height}`,
				`  Scale: ${device.deviceScaleFactor}x`,
				`  Mobile: ${device.isMobile}`,
				`  Touch: ${device.hasTouch}`,
				`  User Agent: ${device.userAgent.slice(0, 80)}...`,
				"",
				`Usage: browse goto <url> --device "${resolvedName}"`,
			];

			return { ok: true, data: lines.join("\n") };
		}

		default:
			return {
				ok: false,
				error: `Unknown devices subcommand: "${sub}". Use: list, search, info`,
			};
	}
}
