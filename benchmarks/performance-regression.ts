import {
	assertSuccess,
	bestEffortQuit,
	createBatchFile,
	fixtureUrl,
	resolveOutputDir,
	runBrowse,
	writeJsonArtifact,
} from "./lib.ts";

const iterations = Number.parseInt(
	process.env.BROWSE_BENCHMARK_ITERATIONS ?? "10",
	10,
);
const outDir = resolveOutputDir("regression");

const registerUrl = fixtureUrl("register.html");
const welcomeUrl = fixtureUrl("welcome.html");
const testPageUrl = fixtureUrl("test-page.html");

const batchFile = createBatchFile(outDir, "warm-batch.json", [
	{ cmd: "goto", args: [registerUrl] },
	{ cmd: "snapshot", args: [] },
	{ cmd: "text", args: [] },
]);

try {
	await bestEffortQuit();

	const coldStart = await runBrowse(["goto", welcomeUrl]);
	assertSuccess(coldStart, "cold start goto");

	const benchmarkRun = await runBrowse([
		"benchmark",
		"--iterations",
		String(iterations),
		"--json",
	]);
	assertSuccess(benchmarkRun, "benchmark");

	const benchmark = JSON.parse(benchmarkRun.stdout) as {
		iterations: number;
		results: Array<{ name: string; p50: number; p95: number; p99: number }>;
		target: string;
	};

	const navigateWarm = await runBrowse(["goto", testPageUrl]);
	assertSuccess(navigateWarm, "warm goto");

	const snapshotFirst = await runBrowse(["snapshot", "--json"]);
	assertSuccess(snapshotFirst, "first snapshot");

	const snapshotCached = await runBrowse(["snapshot", "--json"]);
	assertSuccess(snapshotCached, "cached snapshot");

	const batchRun = await runBrowse(["batch", batchFile, "--json"]);
	assertSuccess(batchRun, "batch warm path");

	const report = {
		timestamp: new Date().toISOString(),
		iterations,
		coldStartMs: coldStart.durationMs,
		warmGotoMs: navigateWarm.durationMs,
		snapshotMs: {
			first: snapshotFirst.durationMs,
			cached: snapshotCached.durationMs,
		},
		batchMs: batchRun.durationMs,
		benchmark,
	};

	const outPath = writeJsonArtifact(
		outDir,
		"performance-regression.json",
		report,
	);
	process.stdout.write(`${JSON.stringify({ outPath, ...report }, null, 2)}\n`);
} finally {
	await bestEffortQuit();
}
