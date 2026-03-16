import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { BrowseConfig } from "../config.ts";
import type { Response } from "../protocol.ts";

const FLOW_REGISTRY_DIR = join(homedir(), ".bun-browse", "flow-registry");

/**
 * Flow sharing: export, import, and manage reusable flow definitions.
 *
 * Usage:
 *   browse flow-share export <name>                    Export a flow to a shareable JSON file
 *   browse flow-share import <path-or-url>             Import a flow from a file or URL
 *   browse flow-share list                              List installed shared flows
 *   browse flow-share install <github-shorthand>        Install from GitHub (e.g., user/repo/flow-name)
 *   browse flow-share publish <name>                    Export flow to registry directory for sharing
 */
export async function handleFlowShare(
	config: BrowseConfig | null,
	args: string[],
): Promise<Response> {
	const subcommand = args[0];

	switch (subcommand) {
		case "export":
			return handleExport(config, args.slice(1));
		case "import":
			return handleImport(args.slice(1));
		case "list":
			return handleList();
		case "install":
			return handleInstall(args.slice(1));
		case "publish":
			return handlePublish(config, args.slice(1));
		default:
			return {
				ok: false,
				error:
					"Usage: browse flow-share <export|import|list|install|publish>\n\n" +
					"  export <name>              Export a flow from config to a .flow.json file\n" +
					"  import <path>              Import a .flow.json file into the local registry\n" +
					"  list                       List installed shared flows\n" +
					"  install <user/repo/flow>   Install a flow from a GitHub repository\n" +
					"  publish <name>             Publish a flow to the local registry for sharing",
			};
	}
}

function handleExport(config: BrowseConfig | null, args: string[]): Response {
	const flowName = args[0];
	if (!flowName) {
		return { ok: false, error: "Usage: browse flow-share export <flow-name>" };
	}

	if (!config?.flows?.[flowName]) {
		const available = config?.flows
			? Object.keys(config.flows).join(", ")
			: "none";
		return {
			ok: false,
			error: `Flow '${flowName}' not found. Available: ${available}`,
		};
	}

	const flow = config.flows[flowName];
	const exportData = {
		name: flowName,
		version: "1.0.0",
		description: flow.description ?? "",
		variables: flow.variables ?? [],
		steps: flow.steps,
		metadata: {
			exportedAt: new Date().toISOString(),
			source: "browse-cli",
		},
	};

	const outPath = `${flowName}.flow.json`;
	writeFileSync(outPath, JSON.stringify(exportData, null, 2), "utf-8");

	return {
		ok: true,
		data: `Flow '${flowName}' exported to ${outPath}\n\nShare this file or commit it to your repository.\nOthers can import it with: browse flow-share import ${outPath}`,
	};
}

function handleImport(args: string[]): Response {
	const source = args[0];
	if (!source) {
		return {
			ok: false,
			error: "Usage: browse flow-share import <path-to-flow.json>",
		};
	}

	if (!existsSync(source)) {
		return {
			ok: false,
			error: `File not found: ${source}`,
		};
	}

	let raw: string;
	try {
		raw = readFileSync(source, "utf-8");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `Failed to read ${source}: ${message}` };
	}

	let flowData: Record<string, unknown>;
	try {
		flowData = JSON.parse(raw);
	} catch {
		return { ok: false, error: `Invalid JSON in ${source}` };
	}

	const flowName = String(flowData.name ?? basename(source, ".flow.json"));

	// Save to registry
	mkdirSync(FLOW_REGISTRY_DIR, { recursive: true });
	const registryPath = join(FLOW_REGISTRY_DIR, `${flowName}.flow.json`);
	writeFileSync(registryPath, JSON.stringify(flowData, null, 2), "utf-8");

	return {
		ok: true,
		data: `Flow '${flowName}' imported to registry.\nPath: ${registryPath}\n\nTo use in your config, add the flow steps to your browse.config.json flows section.`,
	};
}

function handleList(): Response {
	mkdirSync(FLOW_REGISTRY_DIR, { recursive: true });

	const files = readdirSync(FLOW_REGISTRY_DIR).filter((f) =>
		f.endsWith(".flow.json"),
	);

	if (files.length === 0) {
		return {
			ok: true,
			data: "No shared flows installed.\n\nImport flows with: browse flow-share import <path>\nOr install from GitHub: browse flow-share install <user/repo/flow>",
		};
	}

	const lines: string[] = [];
	lines.push(`Installed flows (${files.length}):`);
	lines.push("");

	for (const file of files) {
		const path = join(FLOW_REGISTRY_DIR, file);
		try {
			const data = JSON.parse(readFileSync(path, "utf-8"));
			const name = data.name ?? basename(file, ".flow.json");
			const desc = data.description ? ` — ${data.description}` : "";
			const steps = Array.isArray(data.steps) ? data.steps.length : 0;
			const vars =
				Array.isArray(data.variables) && data.variables.length > 0
					? `\n    Variables: ${data.variables.join(", ")}`
					: "";
			lines.push(`  ${name}${desc}`);
			lines.push(`    ${steps} steps${vars}`);
			lines.push(`    Path: ${path}`);
			lines.push("");
		} catch {
			lines.push(`  ${basename(file, ".flow.json")} (unreadable)`);
			lines.push("");
		}
	}

	return { ok: true, data: lines.join("\n").trimEnd() };
}

async function handleInstall(args: string[]): Promise<Response> {
	const shorthand = args[0];
	if (!shorthand) {
		return {
			ok: false,
			error:
				"Usage: browse flow-share install <user/repo/flow-name>\n\nFetches a .flow.json from a GitHub repository's root or flows/ directory.",
		};
	}

	const parts = shorthand.split("/");
	if (parts.length < 2) {
		return {
			ok: false,
			error:
				"Expected format: <user/repo> or <user/repo/flow-name>\nExample: browse flow-share install acme/browse-flows/checkout",
		};
	}

	const [user, repo, ...flowParts] = parts;
	const flowFile =
		flowParts.length > 0
			? `${flowParts.join("/")}.flow.json`
			: "default.flow.json";

	// Try fetching from GitHub raw content
	const urls = [
		`https://raw.githubusercontent.com/${user}/${repo}/main/flows/${flowFile}`,
		`https://raw.githubusercontent.com/${user}/${repo}/main/${flowFile}`,
		`https://raw.githubusercontent.com/${user}/${repo}/master/flows/${flowFile}`,
		`https://raw.githubusercontent.com/${user}/${repo}/master/${flowFile}`,
	];

	let rawContent: string | undefined;
	let fetchedUrl: string | undefined;

	for (const url of urls) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				rawContent = await response.text();
				fetchedUrl = url;
				break;
			}
		} catch {}
	}

	if (!rawContent) {
		return {
			ok: false,
			error: `Could not fetch flow from ${user}/${repo}/${flowFile}.\nTried:\n${urls.map((u) => `  ${u}`).join("\n")}`,
		};
	}

	let flowData: Record<string, unknown>;
	try {
		flowData = JSON.parse(rawContent);
	} catch {
		return {
			ok: false,
			error: `Invalid JSON from ${fetchedUrl}`,
		};
	}

	const flowName = String(flowData.name ?? basename(flowFile, ".flow.json"));

	mkdirSync(FLOW_REGISTRY_DIR, { recursive: true });
	const registryPath = join(FLOW_REGISTRY_DIR, `${flowName}.flow.json`);
	writeFileSync(registryPath, JSON.stringify(flowData, null, 2), "utf-8");

	return {
		ok: true,
		data: `Flow '${flowName}' installed from ${fetchedUrl}\nPath: ${registryPath}\n\nTo use, add the flow to your browse.config.json or reference it by name.`,
	};
}

function handlePublish(config: BrowseConfig | null, args: string[]): Response {
	const flowName = args[0];
	if (!flowName) {
		return {
			ok: false,
			error: "Usage: browse flow-share publish <flow-name>",
		};
	}

	if (!config?.flows?.[flowName]) {
		const available = config?.flows
			? Object.keys(config.flows).join(", ")
			: "none";
		return {
			ok: false,
			error: `Flow '${flowName}' not found. Available: ${available}`,
		};
	}

	const flow = config.flows[flowName];
	const exportData = {
		name: flowName,
		version: "1.0.0",
		description: flow.description ?? "",
		variables: flow.variables ?? [],
		steps: flow.steps,
		metadata: {
			publishedAt: new Date().toISOString(),
			source: "browse-cli",
		},
	};

	mkdirSync(FLOW_REGISTRY_DIR, { recursive: true });
	const registryPath = join(FLOW_REGISTRY_DIR, `${flowName}.flow.json`);
	writeFileSync(registryPath, JSON.stringify(exportData, null, 2), "utf-8");

	return {
		ok: true,
		data: `Flow '${flowName}' published to local registry.\nPath: ${registryPath}\n\nTo share with others:\n  1. Copy ${registryPath} to your repo\n  2. Others install with: browse flow-share import <path>`,
	};
}
