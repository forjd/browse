import type { BrowserContext, Page } from "playwright";
import type { BrowseConfig } from "./config.ts";
import type { Response } from "./protocol.ts";

/** Context bag passed to every plugin command handler. */
export type CommandContext = {
	/** The active Playwright page in the current session/tab. */
	page: Page;
	/** The browser context for the current session. */
	context: BrowserContext;
	/** The loaded browse config, or null if none. */
	config: BrowseConfig | null;
	/** Command arguments (excluding the command name itself). */
	args: string[];
	/** Per-plugin, per-session state — persists across commands within a session. */
	sessionState: Record<string, unknown>;
	/** Request-level metadata. */
	request: { session?: string; json?: boolean; timeout?: number };
};

/** A single command contributed by a plugin. */
export type PluginCommand = {
	/** Command name — must not collide with built-in commands or other plugins. */
	name: string;
	/** One-line summary shown in `browse help`. */
	summary: string;
	/** Full usage text shown in `browse help <command>`. */
	usage: string;
	/** Known flags for this command — enables flag validation. */
	flags?: string[];
	/** If true, this command is exempt from the global timeout. */
	timeoutExempt?: boolean;
	/** The command handler. */
	handler: (ctx: CommandContext) => Promise<Response>;
};

/** Lifecycle hooks a plugin can register. */
export type PluginHooks = {
	/** Called once when the plugin is loaded at daemon startup. */
	init?: (config: BrowseConfig | null) => Promise<void>;
	/** Called before any command executes. Return a Response to short-circuit. */
	beforeCommand?: (
		cmd: string,
		ctx: CommandContext,
		// biome-ignore lint/suspicious/noConfusingVoidType: handlers may return nothing
	) => Promise<Response | void>;
	/** Called after any command executes. Can observe but not mutate the response. */
	afterCommand?: (
		cmd: string,
		ctx: CommandContext,
		response: Response,
	) => Promise<void>;
	/** Called on daemon shutdown. */
	cleanup?: () => Promise<void>;
};

/** The plugin definition — default-export this from your plugin file. */
export type BrowsePlugin = {
	/** Unique plugin name. */
	name: string;
	/** Semver version string. */
	version: string;
	/** Commands contributed by this plugin. */
	commands?: PluginCommand[];
	/** Lifecycle hooks. */
	hooks?: PluginHooks;
};
