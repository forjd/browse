import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

const MAX_STEPS = 20;

const AVAILABLE_COMMANDS = `Available browse commands:
- goto <url> — Navigate to URL
- snapshot — Show interactive elements with @refs
- click <@ref> — Click an element
- fill <@ref> <value> — Fill a text input
- select <@ref> <option> — Select dropdown option
- scroll <direction> — Scroll page (up/down/top/bottom)
- press <key> — Press keyboard key
- screenshot [path] — Take screenshot
- text — Get visible text
- assert text-contains <text> — Assert page contains text
- assert url-contains <text> — Assert URL contains text
- assert visible <selector> — Assert element visible
- wait <condition> — Wait for condition
- back/forward/reload — Navigation
- login --env <name> — Log in using configured environment
`;

export function parseDoFlags(args: string[]): {
	positional: string[];
	dryRun: boolean;
	provider: string | undefined;
	model: string | undefined;
	baseUrl: string | undefined;
	verbose: boolean;
	env: string | undefined;
} {
	const positional: string[] = [];
	let dryRun = false;
	let provider: string | undefined;
	let model: string | undefined;
	let baseUrl: string | undefined;
	let verbose = false;
	let env: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--dry-run") {
			dryRun = true;
		} else if (arg === "--verbose") {
			verbose = true;
		} else if (arg === "--provider" && i + 1 < args.length) {
			provider = args[++i];
		} else if (arg === "--model" && i + 1 < args.length) {
			model = args[++i];
		} else if (arg === "--base-url" && i + 1 < args.length) {
			baseUrl = args[++i];
		} else if (arg === "--env" && i + 1 < args.length) {
			env = args[++i];
		} else if (!arg.startsWith("--")) {
			positional.push(arg);
		}
	}

	return { positional, dryRun, provider, model, baseUrl, verbose, env };
}

export function buildSystemPrompt(env: string | undefined): string {
	return `You are a browser automation planner. Given a user's instruction and the current page state, output a JSON array of browse CLI commands to achieve the goal.

${AVAILABLE_COMMANDS}

Rules:
- Output ONLY a JSON array of command strings, nothing else
- Each string is a browse command without the "browse" prefix
- Maximum ${MAX_STEPS} commands
- Use "snapshot" before clicking/filling to get @refs
- Do NOT include "quit", "wipe", or "record" commands
- If login is needed and --env is available, use "login --env <name>"
${env ? `- Available environment for login: ${env}` : ""}

Example output:
["goto https://example.com", "snapshot", "click @e1", "screenshot"]`;
}

export function buildUserPrompt(
	currentUrl: string,
	instruction: string,
): string {
	return `Page context: Current page: ${currentUrl}\n\nInstruction: ${instruction}`;
}

export function parseCommandList(raw: string): string[] | null {
	const jsonMatch = raw.match(/\[[\s\S]*\]/);
	if (!jsonMatch) return null;

	try {
		const parsed = JSON.parse(jsonMatch[0]);
		if (!Array.isArray(parsed)) return null;
		return parsed;
	} catch {
		return null;
	}
}

export function capCommands(commands: string[]): string[] {
	if (commands.length > MAX_STEPS) {
		return commands.slice(0, MAX_STEPS);
	}
	return commands;
}

export function formatDryRun(commands: string[]): string {
	const lines = commands.map((cmd, i) => `  ${i + 1}. browse ${cmd}`);
	return `Planned commands:\n${lines.join("\n")}`;
}

export function formatPlan(commands: string[]): string {
	const lines = commands.map((cmd, i) => `  ${i + 1}. browse ${cmd}`);
	return `Planned ${commands.length} commands:\n${lines.join("\n")}\n\nExecute these commands sequentially to complete the task.`;
}

export async function handleDo(page: Page, args: string[]): Promise<Response> {
	const { positional, dryRun, provider, model, baseUrl, env } =
		parseDoFlags(args);

	const instruction = positional.join(" ");
	if (!instruction) {
		return {
			ok: false,
			error:
				'Usage: browse do "<instruction>" [--dry-run] [--provider anthropic|openai] [--model <model>]',
		};
	}

	// Determine provider and API key (same as assert-ai)
	const resolvedProvider = provider ?? (baseUrl ? "openai" : "anthropic");
	let apiKey: string | undefined;

	if (resolvedProvider === "anthropic") {
		apiKey = process.env.ANTHROPIC_API_KEY;
		if (!apiKey) {
			return {
				ok: false,
				error:
					"ANTHROPIC_API_KEY environment variable is required for the 'do' command.",
			};
		}
	} else if (resolvedProvider === "openai") {
		apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			return {
				ok: false,
				error: "OPENAI_API_KEY environment variable is required.",
			};
		}
	} else {
		return {
			ok: false,
			error: `Unknown provider: ${resolvedProvider}`,
		};
	}

	// Get current page context
	const currentUrl = page.url();

	// Build prompts
	const systemPrompt = buildSystemPrompt(env);
	const userPrompt = buildUserPrompt(currentUrl, instruction);

	try {
		let commandsJson: string;

		if (resolvedProvider === "anthropic") {
			const resp = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: model ?? "claude-sonnet-4-20250514",
					max_tokens: 1024,
					system: systemPrompt,
					messages: [{ role: "user", content: userPrompt }],
				}),
			});
			const data = (await resp.json()) as {
				content?: { text?: string }[];
			};
			commandsJson = data.content?.[0]?.text ?? "[]";
		} else {
			const resp = await fetch(
				`${baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com"}/v1/chat/completions`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`,
					},
					body: JSON.stringify({
						model: model ?? "gpt-4o",
						messages: [
							{ role: "system", content: systemPrompt },
							{ role: "user", content: userPrompt },
						],
						max_tokens: 1024,
					}),
				},
			);
			const data = (await resp.json()) as {
				choices?: { message?: { content?: string } }[];
			};
			commandsJson = data.choices?.[0]?.message?.content ?? "[]";
		}

		// Parse the command list
		const commands = parseCommandList(commandsJson);
		if (!commands) {
			return {
				ok: false,
				error: `Failed to parse LLM response as command list: ${commandsJson.slice(0, 200)}`,
			};
		}

		if (commands.length === 0) {
			return { ok: false, error: "LLM returned empty command list." };
		}

		const capped = capCommands(commands);

		// Dry run: just show commands
		if (dryRun) {
			return { ok: true, data: formatDryRun(capped) };
		}

		return { ok: true, data: formatPlan(capped) };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			error: `Natural language planning failed: ${message}`,
		};
	}
}
