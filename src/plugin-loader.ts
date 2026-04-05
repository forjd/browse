import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { BrowseConfig } from "./config.ts";
import type {
	BrowsePlugin,
	CommandContext,
	PluginCommand,
	PluginHooks,
} from "./plugin.ts";
import type { Response } from "./protocol.ts";

export type PluginRegistry = {
	plugins: Map<string, BrowsePlugin>;
	commands: Map<string, { plugin: string; command: PluginCommand }>;
	hooks: {
		beforeCommand: Array<{
			plugin: string;
			hook: NonNullable<PluginHooks["beforeCommand"]>;
		}>;
		afterCommand: Array<{
			plugin: string;
			hook: NonNullable<PluginHooks["afterCommand"]>;
		}>;
		cleanup: Array<{
			plugin: string;
			hook: NonNullable<PluginHooks["cleanup"]>;
		}>;
	};
};

export function createEmptyRegistry(): PluginRegistry {
	return {
		plugins: new Map(),
		commands: new Map(),
		hooks: {
			beforeCommand: [],
			afterCommand: [],
			cleanup: [],
		},
	};
}

/**
 * Discover plugin paths from config and the global plugins directory.
 * Config-declared plugins come first (higher precedence on collision).
 */
export function discoverPluginPaths(
	configPlugins: string[] | undefined,
	configFilePath: string | null,
): string[] {
	const paths: string[] = [];

	// 1. Explicit config entries
	if (configPlugins) {
		const configDir = configFilePath ? dirname(configFilePath) : process.cwd();
		for (const entry of configPlugins) {
			if (entry.startsWith(".") || entry.startsWith("/")) {
				// Relative or absolute path
				paths.push(resolve(configDir, entry));
			} else {
				// Bare package name — import() will resolve from node_modules
				paths.push(entry);
			}
		}
	}

	// 2. Auto-discovery from ~/.browse/plugins/
	const globalPluginDir = join(homedir(), ".browse", "plugins");
	if (existsSync(globalPluginDir)) {
		try {
			const entries = readdirSync(globalPluginDir);
			for (const entry of entries) {
				if (entry.endsWith(".ts") || entry.endsWith(".js")) {
					paths.push(join(globalPluginDir, entry));
				}
			}
		} catch {
			// Directory not readable — skip
		}
	}

	return paths;
}

/** Runtime shape validation for a plugin object. */
export function validatePlugin(
	value: unknown,
	sourcePath: string,
): BrowsePlugin | string {
	if (typeof value !== "object" || value === null) {
		return `Plugin at '${sourcePath}' does not export an object.`;
	}

	const obj = value as Record<string, unknown>;

	if (typeof obj.name !== "string" || obj.name.length === 0) {
		return `Plugin at '${sourcePath}' is missing a 'name' string.`;
	}

	if (typeof obj.version !== "string" || obj.version.length === 0) {
		return `Plugin '${obj.name}' at '${sourcePath}' is missing a 'version' string.`;
	}

	if (obj.commands !== undefined) {
		if (!Array.isArray(obj.commands)) {
			return `Plugin '${obj.name}': 'commands' must be an array.`;
		}
		for (let i = 0; i < obj.commands.length; i++) {
			const err = validatePluginCommand(obj.commands[i], obj.name as string, i);
			if (err) return err;
		}
	}

	if (obj.hooks !== undefined) {
		if (typeof obj.hooks !== "object" || obj.hooks === null) {
			return `Plugin '${obj.name}': 'hooks' must be an object.`;
		}
		const hooks = obj.hooks as Record<string, unknown>;
		for (const key of ["init", "beforeCommand", "afterCommand", "cleanup"]) {
			if (hooks[key] !== undefined && typeof hooks[key] !== "function") {
				return `Plugin '${obj.name}': hooks.${key} must be a function.`;
			}
		}
	}

	return value as BrowsePlugin;
}

function validatePluginCommand(
	cmd: unknown,
	pluginName: string,
	index: number,
): string | null {
	if (typeof cmd !== "object" || cmd === null) {
		return `Plugin '${pluginName}': command at index ${index} must be an object.`;
	}

	const obj = cmd as Record<string, unknown>;

	if (typeof obj.name !== "string" || obj.name.length === 0) {
		return `Plugin '${pluginName}': command at index ${index} is missing a 'name' string.`;
	}

	if (typeof obj.summary !== "string") {
		return `Plugin '${pluginName}': command '${obj.name}' is missing a 'summary' string.`;
	}

	if (typeof obj.usage !== "string") {
		return `Plugin '${pluginName}': command '${obj.name}' is missing a 'usage' string.`;
	}

	if (typeof obj.handler !== "function") {
		return `Plugin '${pluginName}': command '${obj.name}' is missing a 'handler' function.`;
	}

	if (obj.flags !== undefined) {
		if (
			!Array.isArray(obj.flags) ||
			!obj.flags.every((f: unknown) => typeof f === "string")
		) {
			return `Plugin '${pluginName}': command '${obj.name}' 'flags' must be a string array.`;
		}
	}

	return null;
}

/**
 * Load all plugins from the given paths.
 * Returns a populated registry and a list of non-fatal errors.
 */
export async function loadPlugins(
	pluginPaths: string[],
	config: BrowseConfig | null,
	builtinCommands: ReadonlySet<string>,
): Promise<{ registry: PluginRegistry; errors: string[] }> {
	const registry = createEmptyRegistry();
	const errors: string[] = [];

	for (const path of pluginPaths) {
		try {
			const mod = await import(path);
			const raw = mod.default ?? mod;

			const result = validatePlugin(raw, path);
			if (typeof result === "string") {
				errors.push(result);
				continue;
			}

			const plugin = result;

			// Check for duplicate plugin name
			if (registry.plugins.has(plugin.name)) {
				errors.push(
					`Plugin '${plugin.name}' at '${path}' skipped: a plugin with the same name is already loaded.`,
				);
				continue;
			}

			// Register commands
			if (plugin.commands) {
				for (const command of plugin.commands) {
					if (builtinCommands.has(command.name)) {
						errors.push(
							`Plugin '${plugin.name}': command '${command.name}' conflicts with a built-in command — skipped.`,
						);
						continue;
					}

					const existing = registry.commands.get(command.name);
					if (existing) {
						errors.push(
							`Plugin '${plugin.name}': command '${command.name}' conflicts with plugin '${existing.plugin}' — skipped.`,
						);
						continue;
					}

					registry.commands.set(command.name, {
						plugin: plugin.name,
						command,
					});
				}
			}

			// Register hooks
			if (plugin.hooks) {
				if (plugin.hooks.beforeCommand) {
					registry.hooks.beforeCommand.push({
						plugin: plugin.name,
						hook: plugin.hooks.beforeCommand,
					});
				}
				if (plugin.hooks.afterCommand) {
					registry.hooks.afterCommand.push({
						plugin: plugin.name,
						hook: plugin.hooks.afterCommand,
					});
				}
				if (plugin.hooks.cleanup) {
					registry.hooks.cleanup.push({
						plugin: plugin.name,
						hook: plugin.hooks.cleanup,
					});
				}
			}

			// Call init hook
			if (plugin.hooks?.init) {
				try {
					await plugin.hooks.init(config);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					errors.push(`Plugin '${plugin.name}': init hook failed: ${message}`);
					// Still register the plugin — init failure is non-fatal
				}
			}

			registry.plugins.set(plugin.name, plugin);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			errors.push(`Failed to load plugin at '${path}': ${message}`);
		}
	}

	return { registry, errors };
}

/**
 * Run beforeCommand hooks. Returns a short-circuit Response if any hook
 * returns one, otherwise undefined.
 */
export async function runBeforeHooks(
	registry: PluginRegistry,
	cmd: string,
	ctx: CommandContext,
): Promise<Response | undefined> {
	for (const { plugin, hook } of registry.hooks.beforeCommand) {
		try {
			const result = await hook(cmd, ctx);
			if (result) return result;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: `Plugin '${plugin}' beforeCommand hook failed: ${message}`,
			};
		}
	}
	return undefined;
}

/** Run afterCommand hooks. Errors are logged but do not affect the response. */
export async function runAfterHooks(
	registry: PluginRegistry,
	cmd: string,
	ctx: CommandContext,
	response: Response,
): Promise<void> {
	for (const { hook } of registry.hooks.afterCommand) {
		try {
			await hook(cmd, ctx, response);
		} catch {
			// afterCommand hook errors are silently ignored to avoid
			// corrupting the already-produced response
		}
	}
}

/** Run cleanup hooks on daemon shutdown. */
export async function runCleanupHooks(registry: PluginRegistry): Promise<void> {
	for (const { hook } of registry.hooks.cleanup) {
		try {
			await hook();
		} catch {
			// Cleanup errors are silently ignored during shutdown
		}
	}
}

/**
 * Get or create per-plugin session state for a given plugin name.
 */
export function getPluginSessionState(
	pluginState: Map<string, Record<string, unknown>>,
	pluginName: string,
): Record<string, unknown> {
	let state = pluginState.get(pluginName);
	if (!state) {
		state = {};
		pluginState.set(pluginName, state);
	}
	return state;
}
