import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export type SuccessCondition =
	| { urlContains: string }
	| { urlPattern: string }
	| { elementVisible: string };

export type EnvironmentConfig = {
	loginUrl: string;
	userEnvVar: string;
	passEnvVar: string;
	usernameField?: string;
	passwordField?: string;
	submitButton?: string;
	successCondition: SuccessCondition;
};

// Phase 4 types

export type WaitCondition =
	| { urlContains: string }
	| { urlPattern: string }
	| { elementVisible: string }
	| { textVisible: string }
	| { timeout: number };

export type AssertCondition =
	| { visible: string }
	| { notVisible: string }
	| { textContains: string }
	| { textNotContains: string }
	| { urlContains: string }
	| { urlPattern: string }
	| { elementText: { selector: string; contains: string } }
	| { elementCount: { selector: string; count: number } };

export type FlowCondition =
	| { urlContains: string }
	| { urlPattern: string }
	| { elementVisible: string }
	| { elementNotVisible: string }
	| { textVisible: string };

export type FlowStep =
	| { goto: string }
	| { click: string }
	| { fill: Record<string, string> }
	| { select: Record<string, string> }
	| { screenshot: true | string }
	| { console: "error" | "warning" | "all" }
	| { network: true }
	| { wait: WaitCondition }
	| { assert: AssertCondition }
	| { login: string }
	| { snapshot: true }
	| { if: { condition: FlowCondition; then: FlowStep[]; else?: FlowStep[] } }
	| {
			while: {
				condition: FlowCondition;
				steps: FlowStep[];
				maxIterations?: number;
			};
	  };

export type FlowConfig = {
	description?: string;
	variables?: string[];
	steps: FlowStep[];
};

export type PermissionConfig = {
	page: string;
	granted: AssertCondition;
	denied: AssertCondition;
};

export type HealthcheckPage = {
	url: string;
	name?: string;
	screenshot?: boolean;
	console?: "error" | "warning";
	assertions?: AssertCondition[];
};

export type HealthcheckConfig = {
	pages: HealthcheckPage[];
};

export type BrowseConfig = {
	environments: Record<string, EnvironmentConfig>;
	flows?: Record<string, FlowConfig>;
	permissions?: Record<string, PermissionConfig>;
	healthcheck?: HealthcheckConfig;
	timeout?: number;
};

/** Passed alongside config so commands can distinguish "not found" from "invalid". */
export type ConfigContext = {
	configError?: string | null;
};

/**
 * Resolve the config file path using the following precedence:
 * 1. Explicit path (from --config flag)
 * 2. Walk upward from cwd looking for browse.config.json
 * 3. Global fallback at ~/.browse/config.json
 * Returns null if no config file is found.
 */
export function resolveConfigPath(explicitPath?: string): string | null {
	if (explicitPath) {
		const resolved = resolve(explicitPath);
		if (!existsSync(resolved)) {
			throw new Error(
				`Config file not found: ${resolved} (specified via --config)`,
			);
		}
		return resolved;
	}

	// Walk upward from cwd
	let dir = process.cwd();
	while (true) {
		const candidate = join(dir, "browse.config.json");
		if (existsSync(candidate)) {
			return candidate;
		}
		const parent = dirname(dir);
		if (parent === dir) break; // reached filesystem root
		dir = parent;
	}

	// Global fallback
	const globalConfig = join(homedir(), ".browse", "config.json");
	if (existsSync(globalConfig)) {
		return globalConfig;
	}

	return null;
}

export function loadConfig(path: string): {
	config: BrowseConfig | null;
	error: string | null;
} {
	if (!existsSync(path)) {
		return { config: null, error: null };
	}

	let raw: string;
	try {
		raw = readFileSync(path, "utf-8");
	} catch {
		return { config: null, error: `Failed to read browse.config.json.` };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			config: null,
			error: `Failed to parse browse.config.json: ${message}`,
		};
	}

	const validationError = validateConfig(parsed);
	if (validationError) {
		return { config: null, error: validationError };
	}

	return { config: parsed as BrowseConfig, error: null };
}

const VALID_CONDITION_KEYS = new Set([
	"urlContains",
	"urlPattern",
	"elementVisible",
	"elementNotVisible",
	"textVisible",
]);

const VALID_FLOW_STEP_KEYS = new Set([
	"goto",
	"click",
	"fill",
	"select",
	"screenshot",
	"console",
	"network",
	"wait",
	"assert",
	"login",
	"snapshot",
	"if",
	"while",
]);

const VALID_ASSERT_CONDITION_KEYS = new Set([
	"visible",
	"notVisible",
	"textContains",
	"textNotContains",
	"urlContains",
	"urlPattern",
	"elementText",
	"elementCount",
]);

function validateFlowCondition(
	condition: unknown,
	context: string,
): string | null {
	if (typeof condition !== "object" || condition === null) {
		return `Invalid browse.config.json: ${context} condition must be an object.`;
	}
	const keys = Object.keys(condition as Record<string, unknown>);
	if (keys.length !== 1 || !VALID_CONDITION_KEYS.has(keys[0])) {
		return `Invalid browse.config.json: ${context} has invalid condition. Valid keys: ${[...VALID_CONDITION_KEYS].join(", ")}.`;
	}
	return null;
}

function validateFlowStep(step: unknown, context: string): string | null {
	if (typeof step !== "object" || step === null) {
		return `Invalid browse.config.json: ${context} must be an object.`;
	}
	const stepObj = step as Record<string, unknown>;
	const stepKeys = Object.keys(stepObj);
	if (stepKeys.length === 0 || !VALID_FLOW_STEP_KEYS.has(stepKeys[0])) {
		return `Invalid browse.config.json: ${context} has invalid type. Valid step types: ${[...VALID_FLOW_STEP_KEYS].join(", ")}.`;
	}

	// Recursively validate if/while structures
	if ("if" in stepObj) {
		const ifBlock = stepObj.if;
		if (typeof ifBlock !== "object" || ifBlock === null) {
			return `Invalid browse.config.json: ${context} 'if' must be an object.`;
		}
		const ifObj = ifBlock as Record<string, unknown>;
		const condErr = validateFlowCondition(ifObj.condition, context);
		if (condErr) return condErr;
		if (!Array.isArray(ifObj.then)) {
			return `Invalid browse.config.json: ${context} 'if' must have a 'then' array.`;
		}
		for (let i = 0; i < ifObj.then.length; i++) {
			const err = validateFlowStep(
				ifObj.then[i],
				`${context} then step ${i + 1}`,
			);
			if (err) return err;
		}
		if (ifObj.else !== undefined) {
			if (!Array.isArray(ifObj.else)) {
				return `Invalid browse.config.json: ${context} 'if.else' must be an array.`;
			}
			for (let i = 0; i < ifObj.else.length; i++) {
				const err = validateFlowStep(
					ifObj.else[i],
					`${context} else step ${i + 1}`,
				);
				if (err) return err;
			}
		}
	}

	if ("while" in stepObj) {
		const whileBlock = stepObj.while;
		if (typeof whileBlock !== "object" || whileBlock === null) {
			return `Invalid browse.config.json: ${context} 'while' must be an object.`;
		}
		const whileObj = whileBlock as Record<string, unknown>;
		const condErr = validateFlowCondition(whileObj.condition, context);
		if (condErr) return condErr;
		if (!Array.isArray(whileObj.steps)) {
			return `Invalid browse.config.json: ${context} 'while' must have a 'steps' array.`;
		}
		for (let i = 0; i < whileObj.steps.length; i++) {
			const err = validateFlowStep(
				whileObj.steps[i],
				`${context} while step ${i + 1}`,
			);
			if (err) return err;
		}
		if (
			whileObj.maxIterations !== undefined &&
			typeof whileObj.maxIterations !== "number"
		) {
			return `Invalid browse.config.json: ${context} 'while.maxIterations' must be a number.`;
		}
	}

	return null;
}

export function validateConfig(data: unknown): string | null {
	if (
		typeof data !== "object" ||
		data === null ||
		typeof (data as Record<string, unknown>).environments !== "object" ||
		(data as Record<string, unknown>).environments === null ||
		Array.isArray((data as Record<string, unknown>).environments)
	) {
		return "Invalid browse.config.json: missing 'environments' object.";
	}

	const obj = data as Record<string, unknown>;

	const envs = obj.environments as Record<string, unknown>;

	for (const [name, envRaw] of Object.entries(envs)) {
		if (typeof envRaw !== "object" || envRaw === null) {
			return `Invalid browse.config.json: environment '${name}' must be an object.`;
		}

		const env = envRaw as Record<string, unknown>;

		for (const field of ["loginUrl", "userEnvVar", "passEnvVar"] as const) {
			if (typeof env[field] !== "string") {
				return `Invalid browse.config.json: environment '${name}' is missing '${field}'.`;
			}
		}

		if (
			typeof env.successCondition !== "object" ||
			env.successCondition === null
		) {
			return `Invalid browse.config.json: environment '${name}' is missing 'successCondition'.`;
		}

		const condition = env.successCondition as Record<string, unknown>;
		const keys = Object.keys(condition);
		if (
			keys.length !== 1 ||
			!VALID_CONDITION_KEYS.has(keys[0]) ||
			typeof condition[keys[0]] !== "string"
		) {
			return `Invalid browse.config.json: environment '${name}' has an invalid 'successCondition'. Must have exactly one of: urlContains, urlPattern, elementVisible.`;
		}
	}

	// Validate flows (optional)
	if (obj.flows !== undefined) {
		if (
			typeof obj.flows !== "object" ||
			obj.flows === null ||
			Array.isArray(obj.flows)
		) {
			return "Invalid browse.config.json: 'flows' must be an object.";
		}

		const flows = obj.flows as Record<string, unknown>;
		for (const [name, flowRaw] of Object.entries(flows)) {
			if (typeof flowRaw !== "object" || flowRaw === null) {
				return `Invalid browse.config.json: flow '${name}' must be an object.`;
			}

			const flow = flowRaw as Record<string, unknown>;

			if (!Array.isArray(flow.steps)) {
				return `Invalid browse.config.json: flow '${name}' is missing 'steps' array.`;
			}

			if (flow.steps.length === 0) {
				return `Invalid browse.config.json: flow '${name}' has empty 'steps' array.`;
			}

			for (let i = 0; i < flow.steps.length; i++) {
				const err = validateFlowStep(
					flow.steps[i],
					`flow '${name}' step ${i + 1}`,
				);
				if (err) return err;
			}
		}
	}

	// Validate permissions (optional)
	if (obj.permissions !== undefined) {
		if (
			typeof obj.permissions !== "object" ||
			obj.permissions === null ||
			Array.isArray(obj.permissions)
		) {
			return "Invalid browse.config.json: 'permissions' must be an object.";
		}

		const perms = obj.permissions as Record<string, unknown>;
		for (const [name, permRaw] of Object.entries(perms)) {
			if (typeof permRaw !== "object" || permRaw === null) {
				return `Invalid browse.config.json: permission '${name}' must be an object.`;
			}

			const perm = permRaw as Record<string, unknown>;

			if (typeof perm.page !== "string") {
				return `Invalid browse.config.json: permission '${name}' is missing 'page'.`;
			}

			for (const field of ["granted", "denied"] as const) {
				if (typeof perm[field] !== "object" || perm[field] === null) {
					return `Invalid browse.config.json: permission '${name}' is missing '${field}'.`;
				}
				const condErr = validateAssertCondition(
					perm[field],
					`permission '${name}' ${field}`,
				);
				if (condErr) return condErr;
			}
		}
	}

	// Validate healthcheck (optional)
	if (obj.healthcheck !== undefined) {
		if (typeof obj.healthcheck !== "object" || obj.healthcheck === null) {
			return "Invalid browse.config.json: 'healthcheck' must be an object.";
		}

		const hc = obj.healthcheck as Record<string, unknown>;

		if (!Array.isArray(hc.pages) || hc.pages.length === 0) {
			return "Invalid browse.config.json: healthcheck 'pages' must be a non-empty array.";
		}

		for (let i = 0; i < hc.pages.length; i++) {
			const page = hc.pages[i] as Record<string, unknown>;
			if (typeof page !== "object" || page === null) {
				return `Invalid browse.config.json: healthcheck page ${i + 1} must be an object.`;
			}
			if (typeof page.url !== "string") {
				return `Invalid browse.config.json: healthcheck page ${i + 1} is missing 'url'.`;
			}

			if (page.assertions !== undefined) {
				if (!Array.isArray(page.assertions)) {
					return `Invalid browse.config.json: healthcheck page ${i + 1} 'assertions' must be an array.`;
				}
				for (let j = 0; j < page.assertions.length; j++) {
					const condErr = validateAssertCondition(
						page.assertions[j],
						`healthcheck page ${i + 1} assertion ${j + 1}`,
					);
					if (condErr) return condErr;
				}
			}
		}
	}

	return null;
}

function validateAssertCondition(
	condition: unknown,
	context: string,
): string | null {
	if (typeof condition !== "object" || condition === null) {
		return `Invalid browse.config.json: ${context} must be an object.`;
	}

	const keys = Object.keys(condition as Record<string, unknown>);
	if (keys.length !== 1 || !VALID_ASSERT_CONDITION_KEYS.has(keys[0])) {
		return `Invalid browse.config.json: ${context} has invalid condition. Valid keys: ${[...VALID_ASSERT_CONDITION_KEYS].join(", ")}.`;
	}

	return null;
}
