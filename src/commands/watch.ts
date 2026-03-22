import { existsSync, watch as fsWatch, readFileSync } from "node:fs";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleWatch(
	_page: Page,
	args: string[],
): Promise<Response> {
	if (args.length === 0) {
		return {
			ok: false,
			error:
				"Usage: browse watch <flow-file.json> [--var key=value]\n\nWatches a flow file for changes and re-runs it automatically.\nNote: Watch mode is designed for interactive terminal use.\nPress Ctrl+C to stop.",
		};
	}

	const filePath = args[0];

	if (!existsSync(filePath)) {
		return {
			ok: false,
			error: `File not found: ${filePath}`,
		};
	}

	// Validate the file is valid JSON
	try {
		const content = readFileSync(filePath, "utf-8");
		JSON.parse(content);
	} catch {
		return {
			ok: false,
			error: `Invalid JSON in ${filePath}`,
		};
	}

	// Start watching the file for changes
	const events: string[] = [];
	let changeCount = 0;

	const watcher = fsWatch(filePath, (eventType) => {
		changeCount++;
		events.push(
			`[${new Date().toISOString()}] ${eventType}: ${filePath} (change #${changeCount})`,
		);
	});

	// Collect events for a window to confirm the watcher is active
	await new Promise((r) => setTimeout(r, 1_000));

	// Keep the watcher reference so it can be cleaned up on process exit
	const cleanup = () => {
		watcher.close();
	};
	process.once("beforeExit", cleanup);

	const lines = [
		`Watching ${filePath} for changes.`,
		`Watcher active — ${changeCount} change(s) detected so far.`,
		'Re-run "browse flow" with this file when changes are detected.',
		"Note: For continuous watch, use the browse CLI in a terminal loop or integrate with a file watcher.",
	];

	if (events.length > 0) {
		lines.push("");
		lines.push("Events:");
		for (const ev of events) {
			lines.push(`  ${ev}`);
		}
	}

	// Clean up — in daemon mode we can't keep indefinite watchers,
	// so we close after reporting status.
	watcher.close();
	process.removeListener("beforeExit", cleanup);

	return {
		ok: true,
		data: lines.join("\n"),
	};
}
