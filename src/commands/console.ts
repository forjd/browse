import type { RingBuffer } from "../buffers.ts";
import type { Response } from "../protocol.ts";

export type ConsoleEntry = {
	level: string;
	text: string;
	location: { url: string; lineNumber: number; columnNumber: number };
	timestamp: number;
};

const VALID_LEVELS = ["log", "info", "warning", "error", "debug"] as const;

export function formatConsoleEntries(entries: ConsoleEntry[]): string {
	return entries
		.map((entry) => {
			const level = entry.level.toUpperCase();
			const loc = entry.location;
			const locationLine = `        at ${loc.url}:${loc.lineNumber}:${loc.columnNumber}`;
			return `[${level}] ${entry.text}\n${locationLine}`;
		})
		.join("\n\n");
}

export function handleConsole(
	buffer: RingBuffer<ConsoleEntry>,
	args: string[],
): Response {
	let levelFilter: string | undefined;
	let keep = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--level") {
			const next = args[i + 1];
			if (!next || next.startsWith("--")) {
				return { ok: false, error: "Missing value for --level." };
			}
			if (!VALID_LEVELS.includes(next as (typeof VALID_LEVELS)[number])) {
				return {
					ok: false,
					error: `Invalid level: ${next}. Valid levels: ${VALID_LEVELS.join(", ")}.`,
				};
			}
			levelFilter = next;
			i++;
		} else if (arg === "--keep") {
			keep = true;
		}
	}

	const filter = levelFilter
		? (entry: ConsoleEntry) => entry.level === levelFilter
		: undefined;

	const entries = keep ? buffer.peek(filter) : buffer.drain(filter);

	if (entries.length === 0) {
		return { ok: true, data: "No console messages." };
	}

	return { ok: true, data: formatConsoleEntries(entries) };
}
