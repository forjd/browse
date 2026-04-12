import { join } from "node:path";
import {
	assertSuccess,
	bestEffortQuit,
	createBatchFile,
	fixtureUrl,
	resolveOutputDir,
	runBrowse,
	writeJsonArtifact,
} from "./lib.ts";

const outDir = resolveOutputDir("workloads");
const screenshotDir = join(outDir, "screenshots");
const traceDir = join(outDir, "traces");

const workloads = [
	{
		name: "warm-inspection",
		batch: [
			{ cmd: "goto", args: [fixtureUrl("welcome.html")] },
			{ cmd: "snapshot", args: [] },
			{ cmd: "text", args: [] },
			{ cmd: "screenshot", args: [join(screenshotDir, "warm-inspection.png")] },
		],
	},
	{
		name: "artifact-capture",
		batch: [
			{ cmd: "goto", args: [fixtureUrl("register.html")] },
			{ cmd: "trace", args: ["start", "--snapshots", "--screenshots"] },
			{ cmd: "snapshot", args: ["--json"] },
			{
				cmd: "screenshot",
				args: [join(screenshotDir, "artifact-capture.png")],
			},
			{
				cmd: "trace",
				args: ["stop", "--out", join(traceDir, "artifact-capture.zip")],
			},
		],
	},
	{
		name: "error-review",
		batch: [
			{ cmd: "goto", args: [fixtureUrl("settings-with-error.html")] },
			{ cmd: "text", args: [] },
			{ cmd: "snapshot", args: [] },
			{ cmd: "screenshot", args: [join(screenshotDir, "error-review.png")] },
		],
	},
];

const results: Array<{
	name: string;
	durationMs: number;
	exitCode: number;
	stderr: string;
}> = [];

try {
	await bestEffortQuit();

	for (const workload of workloads) {
		const batchFile = createBatchFile(
			outDir,
			`${workload.name}.json`,
			workload.batch,
		);
		const run = await runBrowse(["batch", batchFile, "--json"]);
		assertSuccess(run, workload.name);
		results.push({
			name: workload.name,
			durationMs: run.durationMs,
			exitCode: run.exitCode,
			stderr: run.stderr,
		});
	}

	const report = {
		timestamp: new Date().toISOString(),
		workloads: results,
	};
	const outPath = writeJsonArtifact(outDir, "workloads.json", report);
	process.stdout.write(`${JSON.stringify({ outPath, ...report }, null, 2)}\n`);
} finally {
	await bestEffortQuit();
}
