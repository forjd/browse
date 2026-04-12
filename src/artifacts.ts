import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { extname, join } from "node:path";
import type { Response } from "./protocol.ts";

type ArtifactKind = {
	singular: string;
	plural: string;
	extensions: Set<string>;
};

type ArtifactEntry = {
	name: string;
	path: string;
	sizeBytes: number;
	mtimeMs: number;
};

export const SCREENSHOT_ARTIFACT_KIND: ArtifactKind = {
	singular: "screenshot",
	plural: "screenshots",
	extensions: new Set([".png", ".jpg", ".jpeg", ".webp"]),
};

export const TRACE_ARTIFACT_KIND: ArtifactKind = {
	singular: "trace",
	plural: "traces",
	extensions: new Set([".zip"]),
};

export const VIDEO_ARTIFACT_KIND: ArtifactKind = {
	singular: "video",
	plural: "videos",
	extensions: new Set([".webm"]),
};

function isArtifactFile(filepath: string, kind: ArtifactKind): boolean {
	try {
		return (
			kind.extensions.has(extname(filepath).toLowerCase()) &&
			statSync(filepath).isFile()
		);
	} catch {
		return false;
	}
}

export function parseRetentionDuration(duration: string): number | null {
	const match = duration.match(/^(\d+)([dhm])$/);
	if (!match) return null;

	const value = Number.parseInt(match[1], 10);
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

export function formatArtifactBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function listArtifactFiles(
	dir: string,
	kind: ArtifactKind,
): ArtifactEntry[] {
	if (!existsSync(dir)) return [];

	return readdirSync(dir)
		.filter((name) => isArtifactFile(join(dir, name), kind))
		.map((name) => {
			const path = join(dir, name);
			const stat = statSync(path);
			return {
				name,
				path,
				sizeBytes: stat.size,
				mtimeMs: stat.mtimeMs,
			};
		})
		.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function resolveCutoff(duration: string | undefined): number | null | Response {
	if (!duration) return null;

	const parsed = parseRetentionDuration(duration);
	if (parsed === null) {
		return {
			ok: false,
			error: `Invalid duration format: "${duration}". Use formats like "7d", "24h", "30m".`,
		};
	}

	return Date.now() - parsed;
}

export function cleanArtifacts(
	args: string[],
	options: {
		dir: string;
		kind: ArtifactKind;
	},
): Response {
	if (!existsSync(options.dir)) {
		return { ok: true, data: `No ${options.kind.plural} directory found.` };
	}

	const olderThanIndex = args.indexOf("--older-than");
	const duration = olderThanIndex !== -1 ? args[olderThanIndex + 1] : undefined;
	if (olderThanIndex !== -1 && !duration) {
		return { ok: false, error: "Missing duration value for --older-than" };
	}

	const cutoff = resolveCutoff(duration);
	if (cutoff && typeof cutoff !== "number") return cutoff;

	const dryRun = args.includes("--dry-run");
	const matched = listArtifactFiles(options.dir, options.kind).filter(
		(entry) => (typeof cutoff === "number" ? entry.mtimeMs < cutoff : true),
	);

	if (!dryRun) {
		for (const entry of matched) {
			unlinkSync(entry.path);
		}
		return {
			ok: true,
			data: `Deleted ${matched.length} ${options.kind.singular}${matched.length === 1 ? "" : "s"}.`,
		};
	}

	const totalSize = matched.reduce((sum, entry) => sum + entry.sizeBytes, 0);
	const summary = `Would delete ${matched.length} ${options.kind.singular}${matched.length === 1 ? "" : "s"} (${formatArtifactBytes(totalSize)}).`;
	if (matched.length === 0) {
		return { ok: true, data: summary };
	}

	const listing = matched.map(
		(entry) => `  ${entry.name}  ${formatArtifactBytes(entry.sizeBytes)}`,
	);
	return { ok: true, data: `${summary}\n${listing.join("\n")}` };
}

export function applyArtifactRetention(
	dir: string,
	kind: ArtifactKind,
	retention?: string,
): number {
	if (!retention || !existsSync(dir)) {
		return 0;
	}

	const cutoff = resolveCutoff(retention);
	if (cutoff && typeof cutoff !== "number") {
		return 0;
	}

	let deleted = 0;
	for (const entry of listArtifactFiles(dir, kind)) {
		if (typeof cutoff === "number" && entry.mtimeMs < cutoff) {
			unlinkSync(entry.path);
			deleted++;
		}
	}
	return deleted;
}
