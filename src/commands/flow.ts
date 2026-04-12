import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Page } from "playwright";
import type { RingBuffer } from "../buffers.ts";
import type { BrowseConfig, ConfigContext } from "../config.ts";
import type { CustomReporterRegistry } from "../custom-reporter.ts";
import type { FlowSource } from "../flow-loader.ts";
import { isValidFlowName } from "../flow-loader.ts";
import {
	dryRunFlow,
	formatFlowReport,
	parseVars,
	runFlow,
	type StepResult,
} from "../flow-runner.ts";
import {
	formatFlowTemplateList,
	getFlowTemplate,
	getFlowTemplateNames,
} from "../flow-templates.ts";
import type { Response } from "../protocol.ts";
import {
	formatFlowReporter,
	getFlowReporterNames,
	isKnownFlowReporter,
	parseJUnitProperties,
} from "../reporters.ts";
import {
	formatFlowWebhookPayload,
	parseWebhookFlag,
	sendWebhook,
} from "../webhook.ts";
import type { ConsoleEntry } from "./console.ts";
import type { NetworkEntry } from "./network.ts";

export type FlowDeps = {
	consoleBuffer: RingBuffer<ConsoleEntry>;
	networkBuffer: RingBuffer<NetworkEntry>;
	performWipe?: () => Promise<Response>;
};

const FLOW_INIT_USAGE = `Usage: browse flow init <template> [name] [--force]

Available templates:
${formatFlowTemplateList()}`;

const FLOW_USAGE = `Usage: browse flow <name> [--var key=value ...] [--continue-on-error] [--reporter <format>] [--junit-property key=value ...] [--dry-run] [--stream] [--webhook <url>]
browse flow list
browse flow init <template> [name] [--force]`;

const RESERVED_FLOW_SUBCOMMANDS = new Set(["init", "list"]);

function initFlowFromTemplate(
	args: string[],
	configCtx?: ConfigContext,
): Response {
	const templateName = args[0];
	if (!templateName) {
		return { ok: false, error: FLOW_INIT_USAGE };
	}

	const template = getFlowTemplate(templateName);
	if (!template) {
		return {
			ok: false,
			error: `Unknown flow template '${templateName}'. Available: ${getFlowTemplateNames().join(", ")}.`,
		};
	}

	let flowName: string | undefined;
	let force = false;
	for (let i = 1; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--force") {
			force = true;
			continue;
		}
		if (!flowName) {
			flowName = arg;
			continue;
		}
		return { ok: false, error: FLOW_INIT_USAGE };
	}

	const resolvedFlowName = flowName ?? templateName;
	if (RESERVED_FLOW_SUBCOMMANDS.has(resolvedFlowName)) {
		return {
			ok: false,
			error: `Invalid flow name '${resolvedFlowName}'. 'init' and 'list' are reserved for flow subcommands.`,
		};
	}
	if (!isValidFlowName(resolvedFlowName)) {
		return {
			ok: false,
			error: `Invalid flow name '${resolvedFlowName}'. Use letters, numbers, dots, underscores, or hyphens.`,
		};
	}

	if (!configCtx?.configPath) {
		return {
			ok: false,
			error:
				"No browse.config.json found. Create one with 'browse init' first.",
		};
	}

	const configDir = dirname(configCtx.configPath);
	const flowsDir = join(configDir, "flows");
	const outputPath = join(flowsDir, `${resolvedFlowName}.json`);
	const displayPath =
		relative(configDir, outputPath) || `${resolvedFlowName}.json`;

	if (existsSync(outputPath) && !force) {
		return {
			ok: false,
			error: `${displayPath} already exists. Use --force to overwrite the generated flow.`,
		};
	}

	try {
		mkdirSync(flowsDir, { recursive: true });
		writeFileSync(
			outputPath,
			`${JSON.stringify(template.flow, null, 2)}\n`,
			"utf-8",
		);
	} catch (error) {
		return {
			ok: false,
			error: `Failed to write flow template: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	return {
		ok: true,
		data: `Created ${displayPath} from template ${templateName}.`,
	};
}

export async function handleFlow(
	config: BrowseConfig | null,
	page: Page,
	args: string[],
	deps?: FlowDeps,
	configCtx?: ConfigContext,
	flowSources?: Map<string, FlowSource>,
	flowLoadErrors?: string[],
	customReporters?: CustomReporterRegistry,
): Promise<Response> {
	if (!config) {
		if (args[0] === "init") {
			return initFlowFromTemplate(args.slice(1), configCtx);
		}
		return {
			ok: false,
			error:
				configCtx?.configError ??
				"No browse.config.json found. Create one with flow definitions.",
		};
	}

	if (args.length === 0) {
		return {
			ok: false,
			error: FLOW_USAGE,
		};
	}

	const subcommand = args[0];
	if (subcommand === "init") {
		return initFlowFromTemplate(args.slice(1), configCtx);
	}

	// flow list
	if (subcommand === "list") {
		const hasFlows = config.flows && Object.keys(config.flows).length > 0;

		if (!hasFlows && (!flowLoadErrors || flowLoadErrors.length === 0)) {
			return {
				ok: true,
				data: "No flows defined. Add flows to browse.config.json or create JSON files in a flows/ directory.",
			};
		}

		const lines: string[] = [];
		if (hasFlows && config.flows) {
			for (const [name, flow] of Object.entries(config.flows)) {
				const desc = flow.description ? ` — ${flow.description}` : "";
				let sourceTag = "";
				if (flowSources) {
					const source = flowSources.get(name);
					if (source?.type === "file") {
						sourceTag = `  [file: ${source.path}]`;
					} else if (source?.type === "inline") {
						sourceTag = "  [inline]";
					}
				}
				lines.push(`${name}${desc}${sourceTag}`);
				if (flow.variables && flow.variables.length > 0) {
					lines.push(`  Variables: ${flow.variables.join(", ")}`);
				}
				lines.push("");
			}
		}

		if (flowLoadErrors && flowLoadErrors.length > 0) {
			if (lines.length > 0) lines.push("");
			lines.push(
				`Warnings: ${flowLoadErrors.length} flow file(s) failed to load:`,
			);
			for (const err of flowLoadErrors) {
				lines.push(`  - ${err}`);
			}
		}

		return { ok: true, data: lines.join("\n").trim() };
	}

	// flow <name>
	const flowName = subcommand;
	const flows = config.flows ?? {};

	if (!(flowName in flows)) {
		const keys = Object.keys(flows);
		const available = keys.length > 0 ? keys.join(", ") : "(none)";
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
	let reporter: string | undefined;
	for (let i = 1; i < args.length; i++) {
		if (args[i] === "--reporter") {
			const reporterNames = getFlowReporterNames(customReporters);
			if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
				return {
					ok: false,
					error: `Missing value for --reporter. Valid reporters: ${reporterNames}`,
				};
			}
			const reporterValue = args[i + 1];
			if (!isKnownFlowReporter(reporterValue, customReporters)) {
				return {
					ok: false,
					error: `Invalid reporter '${reporterValue}'. Valid reporters: ${reporterNames}`,
				};
			}
			reporter = reporterValue;
			break;
		}
	}

	const junitResult = parseJUnitProperties(args.slice(1));
	if (junitResult.error) {
		return { ok: false, error: junitResult.error };
	}
	if (junitResult.suiteProperties && reporter !== "junit") {
		return {
			ok: false,
			error: "--junit-property requires --reporter junit.",
		};
	}

	// Parse webhook flag
	const webhookResult = parseWebhookFlag(args.slice(1));
	if (webhookResult.error) {
		return { ok: false, error: webhookResult.error };
	}
	const webhookUrl = webhookResult.url;

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
			performWipe: deps.performWipe,
		},
		{ continueOnError, onStep },
	);
	const durationMs = Date.now() - startTime;

	const allPassed = results.every((r) => r.passed);

	// Fire webhook notification (non-blocking)
	if (webhookUrl) {
		const payload = formatFlowWebhookPayload(flowName, results, durationMs);
		sendWebhook(webhookUrl, payload);
	}

	// Streaming output returns NDJSON
	if (stream) {
		const output = streamLines.join("\n");
		return allPassed
			? { ok: true, data: output }
			: { ok: false, error: output };
	}

	if (reporter) {
		const output = formatFlowReporter(
			flowName,
			results,
			durationMs,
			reporter,
			customReporters,
			junitResult,
		);
		return allPassed
			? { ok: true, data: output }
			: { ok: false, error: output };
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
