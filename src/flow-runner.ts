import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import type { RingBuffer } from "./buffers.ts";
import { evaluateAssertCondition } from "./commands/assert.ts";
import { type ConsoleEntry, handleConsole } from "./commands/console.ts";
import { handleGoto } from "./commands/goto.ts";
import { handleLogin } from "./commands/login.ts";
import { handleNetwork, type NetworkEntry } from "./commands/network.ts";
import { handleScreenshot } from "./commands/screenshot.ts";
import { handleSnapshot } from "./commands/snapshot.ts";
import type {
	BrowseConfig,
	FlowConfig,
	FlowStep,
	WaitCondition,
} from "./config.ts";

export function parseVars(args: string[]): Record<string, string> {
	const vars: Record<string, string> = {};

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--var") {
			const next = args[i + 1];
			if (!next) continue;

			const eqIdx = next.indexOf("=");
			if (eqIdx < 0) continue;

			const key = next.slice(0, eqIdx);
			const value = next.slice(eqIdx + 1);
			vars[key] = value;
			i++;
		}
	}

	return vars;
}

export function interpolateVars(
	template: string,
	vars: Record<string, string>,
): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
		return key in vars ? vars[key] : match;
	});
}

function interpolateStep(
	step: FlowStep,
	vars: Record<string, string>,
): FlowStep {
	const raw = JSON.parse(JSON.stringify(step)) as Record<string, unknown>;

	function walk(obj: unknown): unknown {
		if (typeof obj === "string") {
			return interpolateVars(obj, vars);
		}
		if (Array.isArray(obj)) {
			return obj.map(walk);
		}
		if (typeof obj === "object" && obj !== null) {
			const result: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
				result[k] = walk(v);
			}
			return result;
		}
		return obj;
	}

	return walk(raw) as FlowStep;
}

function generateFlowScreenshotPath(flowName: string, stepNum: number): string {
	const dir = join(homedir(), ".bun-browse", "screenshots");
	mkdirSync(dir, { recursive: true });

	const now = new Date();
	const pad = (n: number, len = 2) => String(n).padStart(len, "0");
	const timestamp = [
		now.getFullYear(),
		pad(now.getMonth() + 1),
		pad(now.getDate()),
		"-",
		pad(now.getHours()),
		pad(now.getMinutes()),
		pad(now.getSeconds()),
		"-",
		pad(now.getMilliseconds(), 3),
	].join("");

	return join(dir, `flow-${flowName}-step${stepNum}-${timestamp}.png`);
}

function stepDescription(step: FlowStep): string {
	if ("goto" in step) return `goto ${step.goto}`;
	if ("click" in step) return `click ${step.click}`;
	if ("fill" in step) {
		const fields = Object.keys(step.fill).join(", ");
		return `fill ${fields}`;
	}
	if ("select" in step) {
		const fields = Object.keys(step.select).join(", ");
		return `select ${fields}`;
	}
	if ("screenshot" in step) return "screenshot";
	if ("console" in step) return `console ${step.console}`;
	if ("network" in step) return "network";
	if ("wait" in step) {
		const cond = step.wait;
		if ("urlContains" in cond) return `wait urlContains "${cond.urlContains}"`;
		if ("urlPattern" in cond) return `wait urlPattern "${cond.urlPattern}"`;
		if ("elementVisible" in cond)
			return `wait elementVisible "${cond.elementVisible}"`;
		if ("textVisible" in cond) return `wait textVisible "${cond.textVisible}"`;
		if ("timeout" in cond) return `wait ${cond.timeout}ms`;
		return "wait";
	}
	if ("assert" in step) {
		const cond = step.assert;
		if ("visible" in cond) return `assert visible "${cond.visible}"`;
		if ("notVisible" in cond) return `assert notVisible "${cond.notVisible}"`;
		if ("textContains" in cond)
			return `assert textContains "${cond.textContains}"`;
		if ("textNotContains" in cond)
			return `assert textNotContains "${cond.textNotContains}"`;
		if ("urlContains" in cond)
			return `assert urlContains "${cond.urlContains}"`;
		if ("urlPattern" in cond) return `assert urlPattern "${cond.urlPattern}"`;
		if ("elementText" in cond)
			return `assert elementText "${cond.elementText.selector}"`;
		if ("elementCount" in cond)
			return `assert elementCount "${cond.elementCount.selector}"`;
		return "assert";
	}
	if ("login" in step) return `login ${step.login}`;
	if ("snapshot" in step) return "snapshot";
	return "unknown";
}

export type FlowDeps = {
	page: Page;
	config: BrowseConfig | null;
	consoleBuffer: RingBuffer<ConsoleEntry>;
	networkBuffer: RingBuffer<NetworkEntry>;
};

export type StepResult = {
	stepNum: number;
	description: string;
	passed: boolean;
	error?: string;
	screenshotPath?: string;
};

async function waitForCondition(
	page: Page,
	condition: WaitCondition,
	timeoutMs = 30_000,
): Promise<void> {
	if ("timeout" in condition) {
		await new Promise((resolve) => setTimeout(resolve, condition.timeout));
		return;
	}

	const start = Date.now();
	const interval = 100;

	while (Date.now() - start < timeoutMs) {
		if ("urlContains" in condition) {
			if (page.url().includes(condition.urlContains)) return;
		} else if ("urlPattern" in condition) {
			if (new RegExp(condition.urlPattern).test(page.url())) return;
		} else if ("elementVisible" in condition) {
			try {
				const visible = await page
					.locator(condition.elementVisible)
					.first()
					.isVisible();
				if (visible) return;
			} catch {
				// Element not found yet
			}
		} else if ("textVisible" in condition) {
			try {
				const bodyText = await page.innerText("body");
				if (bodyText.includes(condition.textVisible)) return;
			} catch {
				// Page not ready
			}
		}

		await new Promise((resolve) => setTimeout(resolve, interval));
	}

	// Build a descriptive timeout message
	if ("urlContains" in condition) {
		throw new Error(
			`Timed out after ${timeoutMs / 1000}s. Current URL: ${page.url()}`,
		);
	}
	if ("urlPattern" in condition) {
		throw new Error(
			`Timed out after ${timeoutMs / 1000}s. Current URL: ${page.url()}`,
		);
	}
	if ("elementVisible" in condition) {
		throw new Error(
			`Timed out after ${timeoutMs / 1000}s: expected element "${condition.elementVisible}" to be visible`,
		);
	}
	if ("textVisible" in condition) {
		throw new Error(
			`Timed out after ${timeoutMs / 1000}s: expected text "${condition.textVisible}" to be visible`,
		);
	}
}

async function findAndClickByName(page: Page, name: string): Promise<void> {
	// Try button, then link, then generic clickable
	for (const role of ["button", "link", "menuitem", "tab"] as const) {
		try {
			const locator = page.getByRole(role, { name });
			if ((await locator.count()) > 0) {
				await locator.first().click({ timeout: 5_000 });
				return;
			}
		} catch {
			// Try next role
		}
	}
	throw new Error(
		`Element not found: '${name}' (looked for button, link, menuitem, tab with this name)`,
	);
}

async function findAndFillByName(
	page: Page,
	fields: Record<string, string>,
): Promise<void> {
	for (const [name, value] of Object.entries(fields)) {
		let filled = false;
		for (const role of [
			"textbox",
			"searchbox",
			"combobox",
			"spinbutton",
		] as const) {
			try {
				const locator = page.getByRole(role, { name });
				if ((await locator.count()) > 0) {
					await locator.first().fill(value, { timeout: 5_000 });
					filled = true;
					break;
				}
			} catch {
				// Try next role
			}
		}
		if (!filled) {
			throw new Error(
				`Element not found: '${name}' (looked for textbox, searchbox, combobox, spinbutton with this name)`,
			);
		}
	}
}

async function findAndSelectByName(
	page: Page,
	fields: Record<string, string>,
): Promise<void> {
	for (const [name, value] of Object.entries(fields)) {
		try {
			const locator = page.getByRole("combobox", { name });
			if ((await locator.count()) > 0) {
				await locator.first().selectOption(value, { timeout: 5_000 });
				continue;
			}
		} catch {
			// Try next approach
		}
		try {
			const locator = page.getByLabel(name);
			if ((await locator.count()) > 0) {
				await locator.first().selectOption(value, { timeout: 5_000 });
				continue;
			}
		} catch {
			// Fall through
		}
		throw new Error(
			`Element not found: '${name}' (looked for select/combobox with this name)`,
		);
	}
}

export async function runFlow(
	flowName: string,
	flow: FlowConfig,
	vars: Record<string, string>,
	deps: FlowDeps,
	continueOnError: boolean,
): Promise<{ results: StepResult[]; screenshots: string[] }> {
	const results: StepResult[] = [];
	const screenshots: string[] = [];

	for (let i = 0; i < flow.steps.length; i++) {
		const rawStep = flow.steps[i];
		const step = interpolateStep(rawStep, vars);
		const stepNum = i + 1;
		const desc = stepDescription(step);

		try {
			let screenshotPath: string | undefined;

			if ("goto" in step) {
				await handleGoto(deps.page, [step.goto]);
			} else if ("click" in step) {
				await findAndClickByName(deps.page, step.click);
			} else if ("fill" in step) {
				await findAndFillByName(deps.page, step.fill);
			} else if ("select" in step) {
				await findAndSelectByName(deps.page, step.select);
			} else if ("screenshot" in step) {
				const path =
					typeof step.screenshot === "string"
						? step.screenshot
						: generateFlowScreenshotPath(flowName, stepNum);
				const res = await handleScreenshot(deps.page, [path]);
				if (res.ok) {
					screenshotPath = path;
					screenshots.push(path);
				} else {
					throw new Error(res.error);
				}
			} else if ("console" in step) {
				const level = step.console === "all" ? undefined : step.console;
				const args = level ? ["--level", level, "--keep"] : ["--keep"];
				handleConsole(deps.consoleBuffer, args);
			} else if ("network" in step) {
				handleNetwork(deps.networkBuffer, ["--keep"]);
			} else if ("wait" in step) {
				await waitForCondition(deps.page, step.wait);
			} else if ("assert" in step) {
				const assertResult = await evaluateAssertCondition(
					deps.page,
					step.assert,
				);
				if (!assertResult.passed) {
					throw new Error(assertResult.reason);
				}
			} else if ("login" in step) {
				const res = await handleLogin(deps.config, deps.page, [
					"--env",
					step.login,
				]);
				if (!res.ok) {
					throw new Error(res.error);
				}
			} else if ("snapshot" in step) {
				await handleSnapshot(deps.page, []);
			}

			results.push({
				stepNum,
				description: desc,
				passed: true,
				screenshotPath,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			results.push({
				stepNum,
				description: desc,
				passed: false,
				error: message,
			});

			if (!continueOnError) break;
		}
	}

	return { results, screenshots };
}

export function formatFlowReport(
	flowName: string,
	results: StepResult[],
	totalSteps: number,
	screenshots: string[],
): string {
	const completed = results.filter((r) => r.passed).length;
	const lines: string[] = [];

	lines.push(`Flow: ${flowName} (${completed}/${totalSteps} steps completed)`);
	lines.push("");

	for (const result of results) {
		const mark = result.passed ? "✓" : "✗";
		lines.push(`  ${mark} Step ${result.stepNum}: ${result.description}`);
		if (result.screenshotPath) {
			lines.push(`    → ${result.screenshotPath}`);
		}
		if (!result.passed && result.error) {
			lines.push(`    → ${result.error}`);
		}
	}

	if (screenshots.length > 0) {
		lines.push("");
		lines.push("Screenshots:");
		for (const path of screenshots) {
			const stepResult = results.find((r) => r.screenshotPath === path);
			if (stepResult) {
				lines.push(`  Step ${stepResult.stepNum}: ${path}`);
			}
		}
	} else {
		lines.push("");
		lines.push("Screenshots:");
		lines.push("  (none taken)");
	}

	return lines.join("\n");
}
