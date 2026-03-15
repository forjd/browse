import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleFrame(
	page: Page,
	args: string[],
): Promise<Response> {
	const subcommand = args[0];

	if (!subcommand) {
		return {
			ok: false,
			error: "Usage: browse frame <list|switch|main>",
		};
	}

	switch (subcommand) {
		case "list": {
			const frames = page.frames();
			const lines: string[] = [];
			for (let i = 0; i < frames.length; i++) {
				const frame = frames[i];
				const isMain = frame === page.mainFrame();
				const name = frame.name() || "(unnamed)";
				const url = frame.url();
				const marker = isMain ? " [main]" : "";
				lines.push(`  ${i}.${marker} ${name} (${url})`);
			}
			return { ok: true, data: lines.join("\n") || "No frames." };
		}
		case "switch": {
			const target = args[1];
			if (!target) {
				return {
					ok: false,
					error: "Usage: browse frame switch <index|name|url-substring>",
				};
			}

			const frames = page.frames();

			// Try as index first
			const index = Number.parseInt(target, 10);
			if (!Number.isNaN(index) && index >= 0 && index < frames.length) {
				const frame = frames[index];
				// We can't truly "switch" frames in Playwright — return info for the caller
				return {
					ok: true,
					data: `Frame ${index}: ${frame.name() || "(unnamed)"} (${frame.url()})`,
				};
			}

			// Try by name
			const byName = frames.find((f) => f.name() === target);
			if (byName) {
				const idx = frames.indexOf(byName);
				return {
					ok: true,
					data: `Frame ${idx}: ${byName.name()} (${byName.url()})`,
				};
			}

			// Try by URL substring
			const byUrl = frames.find((f) => f.url().includes(target));
			if (byUrl) {
				const idx = frames.indexOf(byUrl);
				return {
					ok: true,
					data: `Frame ${idx}: ${byUrl.name() || "(unnamed)"} (${byUrl.url()})`,
				};
			}

			return {
				ok: false,
				error: `Frame not found: ${target}. Use 'browse frame list' to see available frames.`,
			};
		}
		case "main": {
			const mainFrame = page.mainFrame();
			return {
				ok: true,
				data: `Main frame: ${mainFrame.url()}`,
			};
		}
		default:
			return {
				ok: false,
				error: `Unknown frame subcommand: ${subcommand}. Use list, switch, or main.`,
			};
	}
}
