import type { Frame, Page } from "playwright";
import type { Response } from "../protocol.ts";
import type { TabState } from "./tab.ts";

export function getActiveFrame(page: Page, tabState: TabState): Frame {
	if (tabState.selectedFrameIndex != null) {
		const frames = page.frames();
		if (
			tabState.selectedFrameIndex >= 0 &&
			tabState.selectedFrameIndex < frames.length
		) {
			return frames[tabState.selectedFrameIndex];
		}
		// Frame index out of range — fall back to main
		tabState.selectedFrameIndex = undefined;
	}
	return page.mainFrame();
}

export async function handleFrame(
	page: Page,
	args: string[],
	tabState: TabState,
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
				const isSelected = tabState.selectedFrameIndex === i;
				const name = frame.name() || "(unnamed)";
				const url = frame.url();
				const markers = [isMain ? "[main]" : "", isSelected ? "[selected]" : ""]
					.filter(Boolean)
					.join(" ");
				const suffix = markers ? ` ${markers}` : "";
				lines.push(`  ${i}.${suffix} ${name} (${url})`);
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
				tabState.selectedFrameIndex = index;
				return {
					ok: true,
					data: `Switched to frame ${index}: ${frame.name() || "(unnamed)"} (${frame.url()})`,
				};
			}

			// Try by name
			const byName = frames.find((f) => f.name() === target);
			if (byName) {
				const idx = frames.indexOf(byName);
				tabState.selectedFrameIndex = idx;
				return {
					ok: true,
					data: `Switched to frame ${idx}: ${byName.name()} (${byName.url()})`,
				};
			}

			// Try by URL substring
			const byUrl = frames.find((f) => f.url().includes(target));
			if (byUrl) {
				const idx = frames.indexOf(byUrl);
				tabState.selectedFrameIndex = idx;
				return {
					ok: true,
					data: `Switched to frame ${idx}: ${byUrl.name() || "(unnamed)"} (${byUrl.url()})`,
				};
			}

			return {
				ok: false,
				error: `Frame not found: ${target}. Use 'browse frame list' to see available frames.`,
			};
		}
		case "main": {
			tabState.selectedFrameIndex = undefined;
			const mainFrame = page.mainFrame();
			return {
				ok: true,
				data: `Switched to main frame: ${mainFrame.url()}`,
			};
		}
		default:
			return {
				ok: false,
				error: `Unknown frame subcommand: ${subcommand}. Use list, switch, or main.`,
			};
	}
}
