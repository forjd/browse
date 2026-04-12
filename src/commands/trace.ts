import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { BrowserContext } from "playwright";
import {
	applyArtifactRetention,
	cleanArtifacts,
	formatArtifactBytes,
	listArtifactFiles,
	TRACE_ARTIFACT_KIND,
} from "../artifacts.ts";
import type { Response } from "../protocol.ts";

export type TraceState = {
	recording: boolean;
	startedAt?: number;
};

export function createTraceState(): TraceState {
	return { recording: false };
}

const TRACES_DIR = join(homedir(), ".bun-browse", "traces");

function generateDefaultTracePath(tracesDir = TRACES_DIR): string {
	mkdirSync(tracesDir, { recursive: true });

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

	return join(tracesDir, `trace-${timestamp}.zip`);
}

/** List trace .zip files sorted newest-first. */
export function listTraceFiles(): {
	name: string;
	path: string;
	mtime: Date;
	sizeBytes: number;
}[] {
	return listArtifactFiles(TRACES_DIR, TRACE_ARTIFACT_KIND).map((entry) => ({
		name: entry.name,
		path: entry.path,
		mtime: new Date(entry.mtimeMs),
		sizeBytes: entry.sizeBytes,
	}));
}

function findPlaywrightCli(): string {
	// Resolve the playwright CLI binary from node_modules
	const localBin = join(process.cwd(), "node_modules", ".bin", "playwright");
	if (existsSync(localBin)) return localBin;
	// Fallback to npx
	return "npx";
}

export type SpawnFn = (
	cmd: string,
	args: string[],
) => { pid: number | undefined };

/** Default spawn that launches a detached process. */
function defaultSpawn(
	cmd: string,
	args: string[],
): { pid: number | undefined } {
	const proc = Bun.spawn([cmd, ...args], {
		stdio: ["ignore", "ignore", "ignore"],
	});
	proc.unref();
	return { pid: proc.pid };
}

export async function handleTrace(
	context: BrowserContext,
	traceState: TraceState,
	args: string[],
	deps?: {
		spawn?: SpawnFn;
		tracesDir?: string;
		retention?: string;
	},
): Promise<Response> {
	const tracesDir = deps?.tracesDir ?? TRACES_DIR;

	if (args.length === 0) {
		return {
			ok: false,
			error:
				"Usage: browse trace start [--screenshots] [--snapshots]\n       browse trace stop [--out <path>]\n       browse trace view [<path>] [--latest] [--port <port>]\n       browse trace list\n       browse trace clean [--older-than <duration>] [--dry-run]\n       browse trace status",
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

	if (subcommand === "clean") {
		return cleanArtifacts(args.slice(1), {
			dir: tracesDir,
			kind: TRACE_ARTIFACT_KIND,
		});
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

		const savePath = outPath ?? generateDefaultTracePath(tracesDir);

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

			applyArtifactRetention(tracesDir, TRACE_ARTIFACT_KIND, deps?.retention);

			return {
				ok: true,
				data: `Trace saved to ${savePath} (${elapsed}s recording)\nView with: browse trace view ${savePath}`,
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

	if (subcommand === "list") {
		const traces = listArtifactFiles(tracesDir, TRACE_ARTIFACT_KIND);
		if (traces.length === 0) {
			return { ok: true, data: "No traces found." };
		}

		const lines = traces.map(
			(t) =>
				`${t.name}  ${formatArtifactBytes(t.sizeBytes)}  ${new Date(t.mtimeMs).toISOString().replace("T", " ").slice(0, 19)}`,
		);
		return {
			ok: true,
			data: `${traces.length} trace(s):\n${lines.join("\n")}`,
		};
	}

	if (subcommand === "view") {
		const useLatest = args.includes("--latest");

		// Parse --port flag
		let port: string | undefined;
		for (let i = 1; i < args.length; i++) {
			if (args[i] === "--port" && i + 1 < args.length) {
				port = args[i + 1];
				break;
			}
		}

		// Determine trace file path
		let tracePath: string | undefined;

		if (useLatest) {
			const traces = listArtifactFiles(tracesDir, TRACE_ARTIFACT_KIND);
			if (traces.length === 0) {
				return {
					ok: false,
					error:
						"No traces found. Record one with 'browse trace start' then 'browse trace stop'.",
				};
			}
			tracePath = traces[0]?.path;
		} else {
			// Find positional path argument (first arg after "view" that isn't a flag)
			for (let i = 1; i < args.length; i++) {
				const arg = args[i] as string;
				if (arg === "--port") {
					i++; // skip value
					continue;
				}
				if (arg.startsWith("--")) continue;
				tracePath = arg;
				break;
			}
		}

		if (!tracePath) {
			return {
				ok: false,
				error:
					"Provide a trace file path or use --latest.\nUsage: browse trace view <path>\n       browse trace view --latest",
			};
		}

		// Resolve relative paths
		tracePath = resolve(tracePath);

		if (!existsSync(tracePath)) {
			return {
				ok: false,
				error: `Trace file not found: ${tracePath}`,
			};
		}

		// Build playwright show-trace command
		const playwrightCli = findPlaywrightCli();
		const showTraceArgs: string[] =
			playwrightCli === "npx" ? ["playwright", "show-trace"] : ["show-trace"];

		if (port) {
			showTraceArgs.push("--port", port);
		}
		showTraceArgs.push(tracePath);

		const spawn = deps?.spawn ?? defaultSpawn;

		try {
			const { pid } = spawn(playwrightCli, showTraceArgs);

			const parts = [`Trace viewer opened for ${basename(tracePath)}`];
			if (port) {
				parts.push(`Serving on port ${port}`);
			}
			if (pid) {
				parts.push(`(PID: ${pid})`);
			}
			return { ok: true, data: parts.join("\n") };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: `Failed to launch trace viewer: ${message}`,
			};
		}
	}

	return {
		ok: false,
		error: `Unknown trace subcommand: '${subcommand}'. Use start, stop, view, list, clean, or status.`,
	};
}
