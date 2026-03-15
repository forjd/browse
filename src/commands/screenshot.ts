import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { compareScreenshots } from "../visual-diff.ts";

const MAX_HEIGHT = 16_384;

function generateDefaultPath(): string {
	const dir = join(homedir(), ".bun-browse", "screenshots");
	mkdirSync(dir, { recursive: true });

	const now = new Date();
	const pad = (n: number, len = 2) => String(n).padStart(len, "0");
	const timestamp = [
		now.getFullYear(),
		pad(now.getMonth() + 1),
		pad(now.getDate()),
		"-",
		pad(now.getHours()),
		pad(now.getMinutes()),
		pad(now.getSeconds()),
		"-",
		pad(now.getMilliseconds(), 3),
	].join("");

	return join(dir, `screenshot-${timestamp}.png`);
}

function parseArgs(args: string[]): {
	path?: string;
	viewport: boolean;
	selector?: string;
	diff?: string;
	threshold?: number;
	error?: string;
} {
	let path: string | undefined;
	let viewport = false;
	let selector: string | undefined;
	let diff: string | undefined;
	let threshold: number | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--viewport") {
			viewport = true;
		} else if (arg === "--selector") {
			const next = args[i + 1];
			if (!next || next.startsWith("--")) {
				return { viewport, error: "Missing value for --selector." };
			}
			selector = next;
			i++;
		} else if (arg === "--diff") {
			const next = args[i + 1];
			if (!next || next.startsWith("--")) {
				return { viewport, error: "Missing value for --diff." };
			}
			diff = next;
			i++;
		} else if (arg === "--threshold") {
			const next = args[i + 1];
			if (!next || next.startsWith("--")) {
				return { viewport, error: "Missing value for --threshold." };
			}
			const val = Number.parseInt(next, 10);
			if (Number.isNaN(val) || val < 0 || val > 255) {
				return {
					viewport,
					error: "--threshold must be a number between 0 and 255.",
				};
			}
			threshold = val;
			i++;
		} else if (!arg.startsWith("--")) {
			if (!path) {
				path = arg;
			}
		}
	}

	if (viewport && selector) {
		return {
			viewport,
			error: "--viewport and --selector are mutually exclusive.",
		};
	}

	return { path, viewport, selector, diff, threshold };
}

export async function handleScreenshot(
	page: Page,
	args: string[],
): Promise<Response> {
	const parsed = parseArgs(args);

	if (parsed.error) {
		return { ok: false, error: parsed.error };
	}

	const outPath = parsed.path ?? generateDefaultPath();

	try {
		// Ensure parent directory exists
		mkdirSync(dirname(outPath), { recursive: true });

		let screenshotData = outPath;

		if (parsed.selector) {
			const locator = page.locator(parsed.selector);
			const count = await locator.count();
			if (count === 0) {
				return {
					ok: false,
					error: `No element matching selector: ${parsed.selector}`,
				};
			}
			await locator.first().screenshot({ path: outPath, timeout: 10_000 });
		} else if (parsed.viewport) {
			await page.screenshot({ path: outPath, fullPage: false });
		} else {
			// Full-page: check height cap
			const pageHeight = await page.evaluate(
				() => document.documentElement.scrollHeight,
			);

			if (pageHeight > MAX_HEIGHT) {
				await page.screenshot({ path: outPath, fullPage: false });
				screenshotData = `Page too tall for full-page screenshot (>${MAX_HEIGHT}px). Captured viewport only.\n${outPath}`;
			} else {
				await page.screenshot({ path: outPath, fullPage: true });
			}
		}

		// Visual diff comparison
		if (parsed.diff) {
			try {
				const result = compareScreenshots(
					outPath,
					parsed.diff,
					parsed.threshold ?? 10,
				);
				const lines = [
					outPath,
					"",
					`Similarity: ${result.similarity}%`,
					`Different pixels: ${result.diffPixels}/${result.totalPixels}`,
				];
				if (result.dimensionMismatch) {
					lines.push("Warning: images have different dimensions");
				}
				if (result.diffImagePath) {
					lines.push(`Diff image: ${result.diffImagePath}`);
				}
				return { ok: true, data: lines.join("\n") };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					ok: false,
					error: `Screenshot saved to ${outPath}, but diff failed: ${message}`,
				};
			}
		}

		return { ok: true, data: screenshotData };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
