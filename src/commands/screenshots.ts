import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	cleanArtifacts,
	formatArtifactBytes,
	listArtifactFiles,
	SCREENSHOT_ARTIFACT_KIND,
} from "../artifacts.ts";
import type { Response } from "../protocol.ts";

const DEFAULT_SCREENSHOTS_DIR = join(homedir(), ".bun-browse", "screenshots");

function listScreenshots(dir: string): Response {
	if (!existsSync(dir)) {
		return { ok: true, data: "No screenshots directory found." };
	}

	const entries = listArtifactFiles(dir, SCREENSHOT_ARTIFACT_KIND);

	if (entries.length === 0) {
		return { ok: true, data: "No screenshots found." };
	}

	const lines = entries.map((entry) => {
		const date = new Date(entry.mtimeMs)
			.toISOString()
			.replace("T", " ")
			.slice(0, 19);
		return `${entry.name}  ${formatArtifactBytes(entry.sizeBytes)}  ${date}`;
	});

	return { ok: true, data: lines.join("\n") };
}

function cleanScreenshots(args: string[], dir: string): Response {
	return cleanArtifacts(args, {
		dir,
		kind: SCREENSHOT_ARTIFACT_KIND,
	});
}

function countScreenshots(dir: string): Response {
	if (!existsSync(dir)) {
		return { ok: true, data: "No screenshots directory found." };
	}

	let totalSize = 0;
	let count = 0;

	for (const entry of listArtifactFiles(dir, SCREENSHOT_ARTIFACT_KIND)) {
		totalSize += entry.sizeBytes;
		count++;
	}

	return {
		ok: true,
		data: `${count} screenshot${count === 1 ? "" : "s"}, ${formatArtifactBytes(totalSize)} total`,
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
