import type { Page } from "playwright";
import type { RingBuffer } from "../buffers.ts";
import type { BrowseConfig } from "../config.ts";
import { formatFlowReport, parseVars, runFlow } from "../flow-runner.ts";
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
				"Usage: browse flow <name> [--var key=value ...] [--continue-on-error]\nbrowse flow list",
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

	// Parse reporter flag
	let reporter: string | undefined;
	for (let i = 1; i < args.length; i++) {
		if (args[i] === "--reporter" && i + 1 < args.length) {
			reporter = args[i + 1];
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

	if (!deps) {
		return {
			ok: false,
			error:
				"Internal error: flow command requires console and network buffers.",
		};
	}

	const startTime = Date.now();
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
		continueOnError,
	);
	const durationMs = Date.now() - startTime;

	const allPassed = results.every((r) => r.passed);

	if (reporter === "junit") {
		const junit = formatFlowJUnit(flowName, results, durationMs);
		if (allPassed) {
			return { ok: true, data: junit };
		}
		return { ok: false, error: junit };
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
