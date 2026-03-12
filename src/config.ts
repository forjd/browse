import { existsSync, readFileSync } from "node:fs";

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

export type BrowseConfig = {
	environments: Record<string, EnvironmentConfig>;
};

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
]);

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

	const envs = (data as Record<string, unknown>).environments as Record<
		string,
		unknown
	>;

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

	return null;
}
