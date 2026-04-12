import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanupToken } from "../src/auth.ts";
import { computePercentiles } from "../src/commands/benchmark.ts";
import {
	checkStalePid,
	cleanupFiles,
	DEFAULT_CONFIG,
} from "../src/lifecycle.ts";

export const REPO_ROOT = resolve(import.meta.dir, "..");

export type CommandRun = {
	args: string[];
	durationMs: number;
	exitCode: number;
	stdout: string;
	stderr: string;
};

export type DurationSummary = {
	iterations: number;
	p50: number;
	p95: number;
	p99: number;
	min: number;
	max: number;
};

export function resolveOutputDir(name: string): string {
	const baseDir =
		process.env.BROWSE_BENCHMARK_OUT_DIR ??
		join(REPO_ROOT, ".benchmarks", new Date().toISOString().slice(0, 10));
	const outDir = join(baseDir, name);
	mkdirSync(outDir, { recursive: true });
	return outDir;
}

export function fixtureUrl(name: string): string {
	return pathToFileURL(join(REPO_ROOT, "test", "fixtures", name)).href;
}

export async function runBrowse(args: string[]): Promise<CommandRun> {
	const start = performance.now();
	const proc = Bun.spawn([process.execPath, "./src/cli.ts", ...args], {
		cwd: REPO_ROOT,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			BROWSE_HEADED: "0",
		},
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		proc.stdout ? new Response(proc.stdout).text() : Promise.resolve(""),
		proc.stderr ? new Response(proc.stderr).text() : Promise.resolve(""),
		proc.exited,
	]);

	return {
		args,
		durationMs: Math.round(performance.now() - start),
		exitCode,
		stdout,
		stderr,
	};
}

export async function runShell(
	command: string,
	options?: {
		cwd?: string;
		env?: Record<string, string>;
	},
): Promise<CommandRun> {
	const start = performance.now();
	const proc = Bun.spawn(["sh", "-lc", command], {
		cwd: options?.cwd ?? REPO_ROOT,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			...options?.env,
		},
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		proc.stdout ? new Response(proc.stdout).text() : Promise.resolve(""),
		proc.stderr ? new Response(proc.stderr).text() : Promise.resolve(""),
		proc.exited,
	]);

	return {
		args: [command],
		durationMs: Math.round(performance.now() - start),
		exitCode,
		stdout,
		stderr,
	};
}

export async function bestEffortQuit(): Promise<void> {
	try {
		if (checkStalePid(DEFAULT_CONFIG)) {
			await runBrowse(["quit"]);
		} else {
			cleanupFiles(DEFAULT_CONFIG);
			cleanupToken();
		}
	} catch {
		cleanupFiles(DEFAULT_CONFIG);
		cleanupToken();
	}
}

export function writeJsonArtifact(
	outDir: string,
	filename: string,
	value: unknown,
): string {
	const outPath = join(outDir, filename);
	writeFileSync(outPath, `${JSON.stringify(value, null, 2)}\n`);
	return outPath;
}

export function createBatchFile(
	outDir: string,
	filename: string,
	batch: unknown,
): string {
	const outPath = join(outDir, filename);
	writeFileSync(outPath, `${JSON.stringify(batch, null, 2)}\n`);
	return outPath;
}

export function assertSuccess(run: CommandRun, label: string): void {
	if (run.exitCode === 0) return;

	throw new Error(
		`${label} failed with exit ${run.exitCode}\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`,
	);
}

export function summariseDurations(durations: number[]): DurationSummary {
	const sorted = [...durations].sort((a, b) => a - b);
	const { p50, p95, p99 } = computePercentiles(sorted);
	return {
		iterations: durations.length,
		p50,
		p95,
		p99,
		min: sorted[0] ?? 0,
		max: sorted[sorted.length - 1] ?? 0,
	};
}

export function createTempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

export function removeDir(path: string): void {
	rmSync(path, { recursive: true, force: true });
}
