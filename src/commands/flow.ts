import type { Page } from "playwright";
import type { RingBuffer } from "../buffers.ts";
import type { BrowseConfig } from "../config.ts";
import {
	dryRunFlow,
	formatFlowReport,
	parseVars,
	runFlow,
	type StepResult,
} from "../flow-runner.ts";
import type { Response } from "../protocol.ts";
import { formatFlowJUnit } from "../reporters.ts";
import type { ConsoleEntry } from "./console.ts";
import type { NetworkEntry } from "./network.ts";

export type FlowDeps = {
	consoleBuffer: RingBuffer<ConsoleEntry>;
	networkBuffer: RingBuffer<NetworkEntry>;
};

export async function handleFlow(
	config: BrowseConfig | null,
	page: Page,
	args: string[],
	deps?: FlowDeps,
): Promise<Response> {
	if (!config) {
		return {
			ok: false,
			error: "No browse.config.json found. Create one with flow definitions.",
		};
	}

	if (args.length === 0) {
		return {
			ok: false,
			error:
				"Usage: browse flow <name> [--var key=value ...] [--continue-on-error] [--dry-run] [--stream]\nbrowse flow list",
		};
	}

	const subcommand = args[0];

	// flow list
	if (subcommand === "list") {
		if (!config.flows || Object.keys(config.flows).length === 0) {
			return { ok: true, data: "No flows defined in browse.config.json." };
		}

		const lines: string[] = [];
		for (const [name, flow] of Object.entries(config.flows)) {
			const desc = flow.description ? ` — ${flow.description}` : "";
			lines.push(`${name}${desc}`);
			if (flow.variables && flow.variables.length > 0) {
				lines.push(`  Variables: ${flow.variables.join(", ")}`);
			}
			lines.push("");
		}

		return { ok: true, data: lines.join("\n").trim() };
	}

	// flow <name>
	const flowName = subcommand;
	const flows = config.flows ?? {};

	if (!(flowName in flows)) {
		const available = Object.keys(flows).join(", ");
		return {
			ok: false,
			error: `Unknown flow: '${flowName}'. Available: ${available}.`,
		};
	}

	const flow = flows[flowName];
	const vars = parseVars(args.slice(1));
	const continueOnError = args.includes("--continue-on-error");
	const dryRun = args.includes("--dry-run");
	const stream = args.includes("--stream");

	// Parse reporter flag
	const VALID_REPORTERS = ["junit"];
	let reporter: string | undefined;
	for (let i = 1; i < args.length; i++) {
		if (args[i] === "--reporter") {
			if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
				return {
					ok: false,
					error: `Missing value for --reporter. Valid reporters: ${VALID_REPORTERS.join(", ")}`,
				};
			}
			reporter = args[i + 1];
			if (!VALID_REPORTERS.includes(reporter)) {
				return {
					ok: false,
					error: `Invalid reporter '${reporter}'. Valid reporters: ${VALID_REPORTERS.join(", ")}`,
				};
			}
			break;
		}
	}

	// Validate required variables
	if (flow.variables && flow.variables.length > 0) {
		const missing = flow.variables.filter((v) => !(v in vars));
		if (missing.length > 0) {
			const usage = flow.variables.map((v) => `--var ${v}=<value>`).join(" ");
			return {
				ok: false,
				error: `Missing variables for flow '${flowName}': ${missing.join(", ")}\nUsage: browse flow ${flowName} ${usage}`,
			};
		}
	}

	// Dry run mode — preview steps without executing
	if (dryRun) {
		const preview = dryRunFlow(flow, vars);
		return { ok: true, data: preview };
	}

	if (!deps) {
		return {
			ok: false,
			error:
				"Internal error: flow command requires console and network buffers.",
		};
	}

	const startTime = Date.now();

	// Streaming mode — collect NDJSON lines as steps complete
	const streamLines: string[] = [];
	const onStep = stream
		? (result: StepResult) => {
				streamLines.push(JSON.stringify(result));
			}
		: undefined;

	const { results, screenshots } = await runFlow(
		flowName,
		flow,
		vars,
		{
			page,
			config,
			consoleBuffer: deps.consoleBuffer,
			networkBuffer: deps.networkBuffer,
		},
		{ continueOnError, onStep },
	);
	const durationMs = Date.now() - startTime;

	const allPassed = results.every((r) => r.passed);

	// Streaming output returns NDJSON
	if (stream) {
		const output = streamLines.join("\n");
		return allPassed
			? { ok: true, data: output }
			: { ok: false, error: output };
	}

	if (reporter === "junit") {
		const junit = formatFlowJUnit(flowName, results, durationMs);
		return { ok: true, data: junit };
	}

	const report = formatFlowReport(
		flowName,
		results,
		flow.steps.length,
		screenshots,
	);

	if (allPassed) {
		return { ok: true, data: report };
	}
	return { ok: false, error: report };
}
