import type { CDPSession, Page } from "playwright";
import type { RingBuffer } from "./buffers.ts";
import type { ConsoleEntry } from "./commands/console.ts";

/**
 * CDP Runtime.consoleAPICalled event argument shape.
 */
interface CDPRemoteObject {
	type: string;
	value?: unknown;
	description?: string;
	className?: string;
}

interface CDPConsoleEvent {
	type: string;
	args: CDPRemoteObject[];
	stackTrace?: {
		callFrames: Array<{
			url: string;
			lineNumber: number;
			columnNumber: number;
		}>;
	};
}

interface CDPLogEvent {
	entry: {
		level: string;
		text: string;
		source: string;
		url?: string;
		lineNumber?: number;
	};
}

/**
 * Convert a CDP RemoteObject to a display string.
 */
function remoteObjectToString(arg: CDPRemoteObject): string {
	if (arg.value !== undefined) return String(arg.value);
	if (arg.description !== undefined) return arg.description;
	return arg.type;
}

/**
 * Handle a CDP Runtime.consoleAPICalled event, pushing
 * the message into the provided ring buffer.
 */
export function handleCDPConsoleEvent(
	event: CDPConsoleEvent,
	buffer: RingBuffer<ConsoleEntry>,
): void {
	const text = event.args.map(remoteObjectToString).join(" ");
	const frame = event.stackTrace?.callFrames?.[0];
	buffer.push({
		level: event.type,
		text,
		location: {
			url: frame?.url ?? "",
			lineNumber: frame?.lineNumber ?? 0,
			columnNumber: frame?.columnNumber ?? 0,
		},
		timestamp: Date.now(),
	});
}

/**
 * Handle a CDP Log.entryAdded event, pushing the entry
 * into the provided ring buffer (skips worker sources).
 */
export function handleCDPLogEvent(
	event: CDPLogEvent,
	buffer: RingBuffer<ConsoleEntry>,
): void {
	const { level, text, source, url, lineNumber } = event.entry;
	if (source === "worker") return;
	buffer.push({
		level,
		text,
		location: {
			url: url ?? "",
			lineNumber: lineNumber ?? 0,
			columnNumber: 0,
		},
		timestamp: Date.now(),
	});
}

/**
 * Attach a CDP session to a page and enable Runtime + Log domains
 * so that console messages from user JavaScript are captured.
 *
 * Patchright (the Playwright fork used by browse) omits the
 * `Runtime.enable` call that standard Playwright makes, which
 * prevents execution-context tracking and silently drops all
 * Runtime.consoleAPICalled events. This function works around
 * that by opening our own CDP session and forwarding events
 * directly into the ring buffer.
 *
 * Returns the CDP session so callers can detach it if needed.
 */
export async function attachCDPConsoleCapture(
	page: Page,
	buffer: RingBuffer<ConsoleEntry>,
): Promise<CDPSession> {
	const client = await page.context().newCDPSession(page);
	await client.send("Runtime.enable");
	await client.send("Log.enable");

	client.on("Runtime.consoleAPICalled", (event: CDPConsoleEvent) => {
		handleCDPConsoleEvent(event, buffer);
	});

	client.on("Log.entryAdded", (event: CDPLogEvent) => {
		handleCDPLogEvent(event, buffer);
	});

	return client;
}
