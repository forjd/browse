import { OFFICIAL_PLUGINS, type OfficialPlugin } from "./official-plugins.ts";
import {
	type MarketplacePlugin,
	searchMarketplacePlugins,
} from "./plugin-marketplace.ts";
import type { Response } from "./protocol.ts";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 250;

export const PLUGINS_COMMAND_USAGE =
	"Usage: browse plugins <official|search [query...]> [--page <n>] [--limit <n>]";

type PluginsCommandOptions = {
	json?: boolean;
	fetchImpl?: typeof fetch;
};

type SearchArgs = {
	query: string;
	page: number;
	limit: number;
};

export async function handlePluginsCommand(
	args: string[],
	options: PluginsCommandOptions = {},
): Promise<Response> {
	const subcommand = args[0];
	if (!subcommand) {
		return { ok: false, error: PLUGINS_COMMAND_USAGE };
	}

	if (subcommand === "official") {
		return {
			ok: true,
			data: options.json
				? JSON.stringify({ plugins: OFFICIAL_PLUGINS }, null, 2)
				: formatOfficialPlugins(OFFICIAL_PLUGINS),
		};
	}

	if (subcommand === "search") {
		const parsed = parseSearchArgs(args.slice(1));
		if (typeof parsed === "string") {
			return { ok: false, error: parsed };
		}

		try {
			const plugins = await searchMarketplacePlugins(
				parsed.query,
				parsed.page,
				parsed.limit,
				options.fetchImpl,
			);
			return {
				ok: true,
				data: options.json
					? JSON.stringify(
							{
								query: parsed.query,
								page: parsed.page,
								limit: parsed.limit,
								plugins,
							},
							null,
							2,
						)
					: formatMarketplacePlugins(parsed.query, plugins),
			};
		} catch (error) {
			return {
				ok: false,
				error:
					error instanceof Error
						? error.message
						: "Plugin marketplace search failed.",
			};
		}
	}

	return { ok: false, error: PLUGINS_COMMAND_USAGE };
}

function parseSearchArgs(args: string[]): SearchArgs | string {
	let page = DEFAULT_PAGE;
	let limit = DEFAULT_LIMIT;
	const queryParts: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--page") {
			const value = parsePositiveInteger(args[i + 1]);
			if (value === null) {
				return "Invalid value for --page. Expected a positive integer.";
			}
			page = value;
			i++;
			continue;
		}

		if (arg === "--limit") {
			const value = parsePositiveInteger(args[i + 1]);
			if (value === null) {
				return "Invalid value for --limit. Expected a positive integer.";
			}
			limit = Math.min(value, MAX_LIMIT);
			i++;
			continue;
		}

		queryParts.push(arg);
	}

	return {
		query: queryParts.join(" ").trim(),
		page,
		limit,
	};
}

function parsePositiveInteger(value?: string): number | null {
	if (!value) {
		return null;
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return null;
	}
	return parsed;
}

function formatOfficialPlugins(plugins: OfficialPlugin[]): string {
	const lines = ["Official Browse plugins", ""];

	for (const plugin of plugins) {
		lines.push(`${plugin.slug}  ${plugin.packageName}`);
		lines.push(`  ${plugin.description}`);
		lines.push(`  Source: ${plugin.sourcePath}`);
		lines.push(`  Docs: ${plugin.docsUrl}`);
		lines.push("");
	}

	return lines.join("\n").trimEnd();
}

function formatMarketplacePlugins(
	query: string,
	plugins: MarketplacePlugin[],
): string {
	if (plugins.length === 0) {
		return query
			? `No community plugins found for "${query}".`
			: "No community plugins found.";
	}

	const lines = ["Community Browse plugins"];
	if (query) {
		lines.push(`Query: ${query}`);
	}
	lines.push("");

	for (const plugin of plugins) {
		const versionSuffix = plugin.version ? `  ${plugin.version}` : "";
		lines.push(`${plugin.name}${versionSuffix}`);
		if (plugin.description) {
			lines.push(`  ${plugin.description}`);
		}
		if (plugin.links?.npm) {
			lines.push(`  npm: ${plugin.links.npm}`);
		}
		if (plugin.links?.repository) {
			lines.push(`  repo: ${plugin.links.repository}`);
		}
		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
