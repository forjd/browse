import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export type InterceptState = {
	rules: Map<string, InterceptRule>;
};

export type InterceptRule = {
	pattern: string;
	status: number;
	body: string;
	contentType: string;
};

export function createInterceptState(): InterceptState {
	return { rules: new Map() };
}

export async function handleIntercept(
	page: Page,
	args: string[],
	state: InterceptState,
): Promise<Response> {
	const subcommand = args[0];

	if (!subcommand) {
		return {
			ok: false,
			error:
				"Usage: browse intercept <add|remove|list|clear> [url-pattern] [--status N] [--body data] [--content-type type]",
		};
	}

	switch (subcommand) {
		case "add": {
			const pattern = args[1];
			if (!pattern) {
				return {
					ok: false,
					error:
						"Missing URL pattern. Usage: browse intercept add <url-pattern> [--status N] [--body data] [--content-type type]",
				};
			}

			let status = 200;
			let body = "";
			let contentType = "application/json";

			for (let i = 2; i < args.length; i++) {
				if (args[i] === "--status" && args[i + 1]) {
					const parsed = Number.parseInt(args[i + 1], 10);
					if (!Number.isInteger(parsed) || parsed < 100 || parsed > 599) {
						return {
							ok: false,
							error: `Invalid HTTP status code: ${args[i + 1]}. Must be 100–599.`,
						};
					}
					status = parsed;
					i++;
				} else if (args[i] === "--body" && args[i + 1]) {
					body = args[i + 1];
					i++;
				} else if (args[i] === "--content-type" && args[i + 1]) {
					contentType = args[i + 1];
					i++;
				}
			}

			// Remove existing handler for this pattern before adding
			if (state.rules.has(pattern)) {
				await page.unroute(pattern);
			}

			const rule: InterceptRule = { pattern, status, body, contentType };
			state.rules.set(pattern, rule);

			await page.route(pattern, (route) => {
				route.fulfill({
					status: rule.status,
					body: rule.body,
					contentType: rule.contentType,
				});
			});

			return {
				ok: true,
				data: `Intercept added: ${pattern} -> ${status} (${contentType})`,
			};
		}
		case "remove": {
			const pattern = args[1];
			if (!pattern) {
				return {
					ok: false,
					error:
						"Missing URL pattern. Usage: browse intercept remove <url-pattern>",
				};
			}

			if (!state.rules.has(pattern)) {
				return {
					ok: false,
					error: `No intercept rule for: ${pattern}`,
				};
			}

			state.rules.delete(pattern);
			await page.unroute(pattern);

			return {
				ok: true,
				data: `Intercept removed: ${pattern}`,
			};
		}
		case "list": {
			if (state.rules.size === 0) {
				return { ok: true, data: "No intercept rules." };
			}
			const lines: string[] = [];
			for (const [pattern, rule] of state.rules) {
				lines.push(`  ${pattern} -> ${rule.status} (${rule.contentType})`);
			}
			return { ok: true, data: lines.join("\n") };
		}
		case "clear": {
			for (const pattern of state.rules.keys()) {
				await page.unroute(pattern);
			}
			state.rules.clear();
			return { ok: true, data: "All intercept rules cleared." };
		}
		default:
			return {
				ok: false,
				error: `Unknown intercept subcommand: ${subcommand}. Use add, remove, list, or clear.`,
			};
	}
}
