import { readdirSync, statSync, unlinkSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Response } from "../protocol.ts";

const SCREENSHOTS_DIR = join(homedir(), ".bun-browse", "screenshots");

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

function listScreenshots(): Response {
	if (!existsSync(SCREENSHOTS_DIR)) {
		return { ok: true, data: "No screenshots directory found." };
	}

	const files = readdirSync(SCREENSHOTS_DIR);
	if (files.length === 0) {
		return { ok: true, data: "No screenshots found." };
	}

	const entries = files.map((name) => {
		const filepath = join(SCREENSHOTS_DIR, name);
		const stat = statSync(filepath);
		return { name, size: stat.size, mtime: stat.mtimeMs };
	});

	entries.sort((a, b) => b.mtime - a.mtime);

	const lines = entries.map((entry) => {
		const date = new Date(entry.mtime).toISOString().replace("T", " ").slice(0, 19);
		return `${entry.name}  ${formatBytes(entry.size)}  ${date}`;
	});

	return { ok: true, data: lines.join("\n") };
}

function cleanScreenshots(args: string[]): Response {
	if (!existsSync(SCREENSHOTS_DIR)) {
		return { ok: true, data: "No screenshots directory found." };
	}

	const olderThanIdx = args.indexOf("--older-than");
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

	const files = readdirSync(SCREENSHOTS_DIR);
	let deleted = 0;

	for (const name of files) {
		const filepath = join(SCREENSHOTS_DIR, name);
		const stat = statSync(filepath);

		if (cutoffMs === null || stat.mtimeMs < cutoffMs) {
			unlinkSync(filepath);
			deleted++;
		}
	}

	return { ok: true, data: `Deleted ${deleted} screenshot${deleted === 1 ? "" : "s"}.` };
}

function countScreenshots(): Response {
	if (!existsSync(SCREENSHOTS_DIR)) {
		return { ok: true, data: "No screenshots directory found." };
	}

	const files = readdirSync(SCREENSHOTS_DIR);
	let totalSize = 0;

	for (const name of files) {
		const filepath = join(SCREENSHOTS_DIR, name);
		const stat = statSync(filepath);
		totalSize += stat.size;
	}

	return {
		ok: true,
		data: `${files.length} screenshot${files.length === 1 ? "" : "s"}, ${formatBytes(totalSize)} total`,
	};
}

export async function handleScreenshots(args: string[]): Promise<Response> {
	const subcommand = args[0];

	switch (subcommand) {
		case "list":
			return listScreenshots();
		case "clean":
			return cleanScreenshots(args.slice(1));
		case "count":
			return countScreenshots();
		default:
			return {
				ok: false,
				error: `Unknown subcommand: "${subcommand ?? ""}". Use "list", "clean", or "count".`,
			};
	}
}
