import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { BrowserContext } from "playwright";
import type { Response } from "../protocol.ts";

export type TraceState = {
	recording: boolean;
	startedAt?: number;
};

export function createTraceState(): TraceState {
	return { recording: false };
}

function generateDefaultTracePath(): string {
	const dir = join(homedir(), ".bun-browse", "traces");
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
	].join("");

	return join(dir, `trace-${timestamp}.zip`);
}

export async function handleTrace(
	context: BrowserContext,
	traceState: TraceState,
	args: string[],
): Promise<Response> {
	if (args.length === 0) {
		return {
			ok: false,
			error:
				"Usage: browse trace start [--screenshots] [--snapshots]\n       browse trace stop [--out <path>]\n       browse trace status",
		};
	}

	const subcommand = args[0];

	if (subcommand === "status") {
		if (traceState.recording) {
			const elapsed = traceState.startedAt
				? Math.floor((Date.now() - traceState.startedAt) / 1000)
				: 0;
			return {
				ok: true,
				data: `Trace recording in progress (${elapsed}s elapsed)`,
			};
		}
		return { ok: true, data: "No trace recording active." };
	}

	if (subcommand === "start") {
		if (traceState.recording) {
			return {
				ok: false,
				error:
					"Trace recording already in progress. Stop it first with 'browse trace stop'.",
			};
		}

		const screenshots = args.includes("--screenshots");
		const snapshots = args.includes("--snapshots");

		try {
			await context.tracing.start({
				screenshots,
				snapshots,
			});
			traceState.recording = true;
			traceState.startedAt = Date.now();

			const features: string[] = [];
			if (screenshots) features.push("screenshots");
			if (snapshots) features.push("snapshots");
			const featureStr =
				features.length > 0 ? ` with ${features.join(", ")}` : "";

			return {
				ok: true,
				data: `Trace recording started${featureStr}. Use 'browse trace stop --out trace.zip' to save.`,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: `Failed to start trace: ${message}`,
			};
		}
	}

	if (subcommand === "stop") {
		if (!traceState.recording) {
			return {
				ok: false,
				error:
					"No trace recording in progress. Start one with 'browse trace start'.",
			};
		}

		// Parse --out flag
		let outPath: string | undefined;
		for (let i = 1; i < args.length; i++) {
			if (args[i] === "--out" && i + 1 < args.length) {
				outPath = args[i + 1];
				break;
			}
		}

		const savePath = outPath ?? generateDefaultTracePath();

		// Prepare filesystem before stopping the trace — fail fast without
		// altering traceState so the recording can be recovered.
		try {
			mkdirSync(dirname(savePath), { recursive: true });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: `Failed to prepare output directory: ${message}`,
			};
		}

		try {
			await context.tracing.stop({ path: savePath });
			traceState.recording = false;

			const elapsed = traceState.startedAt
				? Math.floor((Date.now() - traceState.startedAt) / 1000)
				: 0;
			traceState.startedAt = undefined;

			if (!existsSync(savePath)) {
				return {
					ok: false,
					error: `Trace stopped but file was not created at ${savePath}`,
				};
			}

			return {
				ok: true,
				data: `Trace saved to ${savePath} (${elapsed}s recording)\nView with: npx playwright show-trace ${savePath}`,
			};
		} catch (err) {
			// tracing.stop failed — the browser may still be recording,
			// so leave traceState intact for recovery.
			const message = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: `Failed to stop trace: ${message}`,
			};
		}
	}

	return {
		ok: false,
		error: `Unknown trace subcommand: '${subcommand}'. Use start, stop, or status.`,
	};
}
