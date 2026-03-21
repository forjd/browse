import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

type Breakpoint = {
	name: string;
	width: number;
	height: number;
};

const DEFAULT_BREAKPOINTS: Breakpoint[] = [
	{ name: "mobile", width: 375, height: 667 },
	{ name: "tablet", width: 768, height: 1024 },
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "wide", width: 1920, height: 1080 },
];

export function parseBreakpoints(args: string[]): Breakpoint[] | null {
	const idx = args.indexOf("--breakpoints");
	if (idx === -1 || idx + 1 >= args.length) return null;

	const raw = args[idx + 1];
	const breakpoints: Breakpoint[] = [];

	for (const part of raw.split(",")) {
		const trimmed = part.trim();
		const match = trimmed.match(/^(\d+)x(\d+)$/);
		if (match) {
			breakpoints.push({
				name: `${match[1]}x${match[2]}`,
				width: Number.parseInt(match[1], 10),
				height: Number.parseInt(match[2], 10),
			});
		}
	}

	return breakpoints.length > 0 ? breakpoints : null;
}

function parseOutputDir(args: string[]): string | null {
	const idx = args.indexOf("--out");
	if (idx === -1 || idx + 1 >= args.length) return null;
	return args[idx + 1];
}

function parseUrl(args: string[]): string | null {
	const idx = args.indexOf("--url");
	if (idx === -1 || idx + 1 >= args.length) return null;
	return args[idx + 1];
}

export function formatResponsiveResults(
	results: { name: string; width: number; height: number; path: string }[],
): string {
	const lines: string[] = [];

	lines.push(`Responsive Screenshots: ${results.length} breakpoints captured`);
	lines.push("");

	const maxName = Math.max(...results.map((r) => r.name.length), 0);

	for (const r of results) {
		lines.push(
			`  ${r.name.padEnd(maxName)}  ${r.width}x${r.height}  ${r.path}`,
		);
	}

	return lines.join("\n");
}

export async function handleResponsive(
	page: Page,
	args: string[],
	options?: { json?: boolean },
): Promise<Response> {
	const jsonOutput = options?.json ?? false;
	const breakpoints = parseBreakpoints(args) ?? DEFAULT_BREAKPOINTS;
	const outDir =
		parseOutputDir(args) ?? join(homedir(), ".bun-browse", "responsive");
	const targetUrl = parseUrl(args);

	// Save original viewport to restore later
	const originalViewport = page.viewportSize();

	mkdirSync(outDir, { recursive: true });
	const timestamp = Date.now();

	const results: {
		name: string;
		width: number;
		height: number;
		path: string;
	}[] = [];

	try {
		for (const bp of breakpoints) {
			await page.setViewportSize({ width: bp.width, height: bp.height });

			if (targetUrl) {
				await page.goto(targetUrl, {
					waitUntil: "domcontentloaded",
					timeout: 30_000,
				});
			} else {
				// Reload to trigger responsive layout recalculation
				await page.reload({ waitUntil: "domcontentloaded" });
			}

			const screenshotPath = join(
				outDir,
				`responsive-${timestamp}-${bp.name}.png`,
			);
			await page.screenshot({ path: screenshotPath, fullPage: true });

			results.push({
				name: bp.name,
				width: bp.width,
				height: bp.height,
				path: screenshotPath,
			});
		}

		// Restore original viewport
		if (originalViewport) {
			await page.setViewportSize(originalViewport);
		}

		if (jsonOutput) {
			return { ok: true, data: JSON.stringify({ breakpoints: results }) };
		}

		return { ok: true, data: formatResponsiveResults(results) };
	} catch (err) {
		// Restore viewport on error
		if (originalViewport) {
			await page.setViewportSize(originalViewport).catch(() => {});
		}
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			error: `Responsive screenshot capture failed: ${message}`,
		};
	}
}
