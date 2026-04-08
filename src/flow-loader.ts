import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { FlowConfig } from "./config.ts";
import { validateFlowStep } from "./config.ts";

export type FlowSource =
	| { type: "inline" }
	| { type: "file"; path: string; directory: "local" | "global" };

export type FlowDirectory = {
	path: string;
	type: "local" | "global";
};

const VALID_FLOW_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Discover flow directories in precedence order (local first, then global).
 */
export function discoverFlowDirectories(
	configFilePath: string | null,
): FlowDirectory[] {
	const dirs: FlowDirectory[] = [];

	if (configFilePath) {
		const localFlowsDir = join(dirname(configFilePath), "flows");
		if (existsSync(localFlowsDir)) {
			dirs.push({ path: localFlowsDir, type: "local" });
		}
	}

	const globalFlowsDir = join(homedir(), ".browse", "flows");
	if (existsSync(globalFlowsDir)) {
		dirs.push({ path: globalFlowsDir, type: "global" });
	}

	return dirs;
}

/**
 * Load and validate a single flow JSON file.
 */
export function loadFlowFile(filePath: string): {
	flow: FlowConfig | null;
	error: string | null;
} {
	const name = basename(filePath);

	let raw: string;
	try {
		raw = readFileSync(filePath, "utf-8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return { flow: null, error: `Flow file not found: ${name}` };
		}
		return { flow: null, error: `Failed to read flow file: ${name}` };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const detail = err instanceof SyntaxError ? err.message : "invalid JSON";
		return {
			flow: null,
			error: `Failed to parse flow file ${name}: ${detail}`,
		};
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return {
			flow: null,
			error: `Invalid flow file ${name}: must be a JSON object.`,
		};
	}

	const obj = parsed as Record<string, unknown>;

	if (!Array.isArray(obj.steps)) {
		return {
			flow: null,
			error: `Invalid flow file ${name}: missing 'steps' array.`,
		};
	}

	if (obj.steps.length === 0) {
		return {
			flow: null,
			error: `Invalid flow file ${name}: 'steps' array is empty.`,
		};
	}

	const sourceLabel = name;
	for (let i = 0; i < obj.steps.length; i++) {
		const err = validateFlowStep(obj.steps[i], `step ${i + 1}`, sourceLabel);
		if (err) {
			return { flow: null, error: err };
		}
	}

	return { flow: parsed as FlowConfig, error: null };
}

/**
 * Load all flow files from the given directories.
 * Earlier directories take precedence over later ones.
 */
export function loadFlowsFromDirectories(dirs: FlowDirectory[]): {
	flows: Record<string, FlowConfig>;
	errors: string[];
	sources: Map<string, FlowSource>;
} {
	const flows: Record<string, FlowConfig> = {};
	const errors: string[] = [];
	const sources = new Map<string, FlowSource>();

	for (const dir of dirs) {
		let files: string[];
		try {
			files = readdirSync(dir.path).filter((f) => f.endsWith(".json"));
		} catch {
			errors.push(`Failed to read flows directory: ${dir.path}`);
			continue;
		}

		for (const file of files) {
			const flowName = basename(file, ".json");

			if (!VALID_FLOW_NAME_RE.test(flowName)) {
				errors.push(
					`Skipping flow file ${file}: invalid flow name '${flowName}'.`,
				);
				continue;
			}

			// Higher-precedence directory wins
			if (flowName in flows) {
				continue;
			}

			const filePath = join(dir.path, file);
			const { flow, error } = loadFlowFile(filePath);

			if (error) {
				errors.push(error);
				continue;
			}

			if (flow) {
				flows[flowName] = flow;
				sources.set(flowName, {
					type: "file",
					path: filePath,
					directory: dir.type,
				});
			}
		}
	}

	return { flows, errors, sources };
}

/**
 * Merge inline flows (from config) with file-based flows.
 * Inline flows take precedence.
 */
export function mergeFlows(
	inlineFlows: Record<string, FlowConfig> | undefined,
	fileFlows: Record<string, FlowConfig>,
	fileSources: Map<string, FlowSource>,
): { merged: Record<string, FlowConfig>; sources: Map<string, FlowSource> } {
	const merged: Record<string, FlowConfig> = {};
	const sources = new Map<string, FlowSource>();

	// File flows first (lower precedence)
	for (const [name, flow] of Object.entries(fileFlows)) {
		merged[name] = flow;
		const source = fileSources.get(name);
		if (source) {
			sources.set(name, source);
		}
	}

	// Inline flows override
	if (inlineFlows) {
		for (const [name, flow] of Object.entries(inlineFlows)) {
			merged[name] = flow;
			sources.set(name, { type: "inline" });
		}
	}

	return { merged, sources };
}
