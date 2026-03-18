import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import type { Response } from "../protocol.ts";

const DEFAULT_SCREENSHOTS_DIR = join(homedir(), ".bun-browse", "screenshots");
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function isScreenshotFile(filepath: string): boolean {
	try {
		return (
			ALLOWED_EXTENSIONS.has(extname(filepath).toLowerCase()) &&
			statSync(filepath).isFile()
		);
	} catch {
		return false;
	}
}

function parseDuration(duration: string): number | null {
	const match = duration.match(/^(\d+)([dhm])$/);
	if (!match) return null;

	const value = parseInt(match[1], 10);
	const unit = match[2];

	switch (unit) {
		case "d":
			return value * 24 * 60 * 60 * 1000;
		case "h":
			return value * 60 * 60 * 1000;
		case "m":
			return value * 60 * 1000;
		default:
			return null;
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function listScreenshots(dir: string): Response {
	if (!existsSync(dir)) {
		return { ok: true, data: "No screenshots directory found." };
	}

	const files = readdirSync(dir);

	const entries = files
		.filter((name) => isScreenshotFile(join(dir, name)))
		.map((name) => {
			const filepath = join(dir, name);
			const stat = statSync(filepath);
			return { name, size: stat.size, mtime: stat.mtimeMs };
		});

	if (entries.length === 0) {
		return { ok: true, data: "No screenshots found." };
	}

	entries.sort((a, b) => b.mtime - a.mtime);

	const lines = entries.map((entry) => {
		const date = new Date(entry.mtime)
			.toISOString()
			.replace("T", " ")
			.slice(0, 19);
		return `${entry.name}  ${formatBytes(entry.size)}  ${date}`;
	});

	return { ok: true, data: lines.join("\n") };
}

function cleanScreenshots(args: string[], dir: string): Response {
	if (!existsSync(dir)) {
		return { ok: true, data: "No screenshots directory found." };
	}

	const olderThanIdx = args.indexOf("--older-than");
	const dryRun = args.includes("--dry-run");
	let cutoffMs: number | null = null;

	if (olderThanIdx !== -1) {
		const durationStr = args[olderThanIdx + 1];
		if (!durationStr) {
			return { ok: false, error: "Missing duration value for --older-than" };
		}
		const duration = parseDuration(durationStr);
		if (duration === null) {
			return {
				ok: false,
				error: `Invalid duration format: "${durationStr}". Use formats like "7d", "24h", "30m".`,
			};
		}
		cutoffMs = Date.now() - duration;
	}

	const files = readdirSync(dir);
	const matched: { name: string; size: number }[] = [];

	for (const name of files) {
		const filepath = join(dir, name);
		if (!isScreenshotFile(filepath)) continue;
		const stat = statSync(filepath);

		if (cutoffMs === null || stat.mtimeMs < cutoffMs) {
			if (dryRun) {
				matched.push({ name, size: stat.size });
			} else {
				unlinkSync(filepath);
				matched.push({ name, size: stat.size });
			}
		}
	}

	if (dryRun) {
		const totalSize = matched.reduce((sum, f) => sum + f.size, 0);
		const listing = matched.map((f) => `  ${f.name}  ${formatBytes(f.size)}`);
		const summary = `Would delete ${matched.length} screenshot${matched.length === 1 ? "" : "s"} (${formatBytes(totalSize)}).`;
		if (listing.length > 0) {
			return { ok: true, data: `${summary}\n${listing.join("\n")}` };
		}
		return { ok: true, data: summary };
	}

	return {
		ok: true,
		data: `Deleted ${matched.length} screenshot${matched.length === 1 ? "" : "s"}.`,
	};
}

function countScreenshots(dir: string): Response {
	if (!existsSync(dir)) {
		return { ok: true, data: "No screenshots directory found." };
	}

	const files = readdirSync(dir);
	let totalSize = 0;
	let count = 0;

	for (const name of files) {
		const filepath = join(dir, name);
		if (!isScreenshotFile(filepath)) continue;
		const stat = statSync(filepath);
		totalSize += stat.size;
		count++;
	}

	return {
		ok: true,
		data: `${count} screenshot${count === 1 ? "" : "s"}, ${formatBytes(totalSize)} total`,
	};
}

export async function handleScreenshots(
	args: string[],
	screenshotsDir?: string,
): Promise<Response> {
	const dir = screenshotsDir ?? DEFAULT_SCREENSHOTS_DIR;
	const subcommand = args[0];

	switch (subcommand) {
		case "list":
			return listScreenshots(dir);
		case "clean":
			return cleanScreenshots(args.slice(1), dir);
		case "count":
			return countScreenshots(dir);
		default:
			return {
				ok: false,
				error: `Unknown subcommand: "${subcommand ?? ""}". Use "list", "clean", or "count".`,
			};
	}
}
