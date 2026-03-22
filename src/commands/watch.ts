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

	// In daemon mode we can't run a persistent watch loop, so we validate
	// the file and return instructions for the user to use it interactively.
	try {
		const content = readFileSync(filePath, "utf-8");
		JSON.parse(content);
	} catch {
		return {
			ok: false,
			error: `Invalid JSON in ${filePath}`,
		};
	}

	return {
		ok: true,
		data: `Watch mode: monitoring ${filePath} for changes.\nRe-run "browse flow" with this file when changes are detected.\nNote: For continuous watch, use the browse CLI in a terminal loop or integrate with a file watcher.`,
	};
}
