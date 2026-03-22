import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import {
	getInjectedScript,
	getStepCount,
	isPaused,
	isRecording,
	pauseSession,
	pushEvent,
	type RecordedEvent,
	resumeSession,
	startSession,
	stopSession,
} from "../recorder.ts";

function parseFlag(args: string[], flag: string): string | null {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return null;
	const value = args[idx + 1];
	// Don't swallow another flag as a value
	if (value.startsWith("--")) return null;
	return value;
}

async function recordStart(page: Page, args: string[]): Promise<Response> {
	if (isRecording()) {
		return {
			ok: false,
			error: "Recording already in progress. Use 'record stop' first.",
		};
	}

	const output = parseFlag(args, "--output") ?? "recording.flow.json";
	const name = parseFlag(args, "--name") ?? "recorded-flow";

	startSession(name, output);

	// Expose the callback function for receiving events from injected script
	try {
		await page.exposeFunction("__browseRecordEvent", (raw: string) => {
			try {
				const event = JSON.parse(raw) as RecordedEvent;
				pushEvent(event);
			} catch {
				// ignore malformed events
			}
		});
	} catch {
		// Function may already be exposed from a previous session
	}

	// Listen for navigations
	page.on("framenavigated", (frame) => {
		if (frame === page.mainFrame()) {
			pushEvent({
				type: "navigation",
				url: frame.url(),
				timestamp: Date.now(),
			});
		}
	});

	// Inject the observer script
	const script = getInjectedScript();
	await page.addInitScript(script);

	// Also evaluate immediately for the current page
	await page.evaluate(script);

	return {
		ok: true,
		data: `Recording started. Output: ${output}, Flow name: "${name}"`,
	};
}

async function recordStop(): Promise<Response> {
	if (!isRecording()) {
		return { ok: false, error: "No recording in progress." };
	}

	const { config, outputPath } = stopSession();

	const resolvedPath = resolve(outputPath);
	const json = JSON.stringify(config, null, 2);

	try {
		writeFileSync(resolvedPath, json, "utf-8");
	} catch (err) {
		return {
			ok: false,
			error: `Failed to write recording: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	return {
		ok: true,
		data: `Recording stopped. ${config.steps.length} step(s) saved to ${resolvedPath}`,
	};
}

async function recordPause(): Promise<Response> {
	if (!isRecording()) {
		return { ok: false, error: "No recording in progress." };
	}
	if (isPaused()) {
		return { ok: false, error: "Recording is already paused." };
	}

	pauseSession();
	return {
		ok: true,
		data: `Recording paused. ${getStepCount()} step(s) captured so far.`,
	};
}

async function recordResume(): Promise<Response> {
	if (!isRecording()) {
		return { ok: false, error: "No recording in progress." };
	}
	if (!isPaused()) {
		return { ok: false, error: "Recording is not paused." };
	}

	resumeSession();
	return { ok: true, data: "Recording resumed." };
}

export async function handleRecord(
	page: Page,
	args: string[],
): Promise<Response> {
	if (args.length === 0) {
		return {
			ok: false,
			error:
				'Usage: browse record <subcommand>\n\nSubcommands:\n  start [--output file.flow.json] [--name "flow-name"]   Start recording\n  stop                                                   Stop and save\n  pause                                                  Pause capture\n  resume                                                 Resume capture',
		};
	}

	const subcommand = args[0];
	const subArgs = args.slice(1);

	switch (subcommand) {
		case "start":
			return recordStart(page, subArgs);
		case "stop":
			return recordStop();
		case "pause":
			return recordPause();
		case "resume":
			return recordResume();
		default:
			return {
				ok: false,
				error: `Unknown record subcommand: "${subcommand}". Use: start, stop, pause, resume`,
			};
	}
}
