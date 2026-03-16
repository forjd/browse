import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import type { RingBuffer } from "../buffers.ts";
import type { AssertCondition, BrowseConfig } from "../config.ts";
import { interpolateVars, parseVars } from "../flow-runner.ts";
import type { Response } from "../protocol.ts";
import { formatHealthcheckJUnit } from "../reporters.ts";
import { evaluateAssertCondition } from "./assert.ts";
import { type ConsoleEntry, formatConsoleEntries } from "./console.ts";
import type { NetworkEntry } from "./network.ts";

export type HealthcheckDeps = {
	consoleBuffer: RingBuffer<ConsoleEntry>;
	networkBuffer: RingBuffer<NetworkEntry>;
};

const VALID_REPORTERS = ["junit"];

export function parseHealthcheckArgs(args: string[]): {
	vars: Record<string, string>;
	noScreenshots: boolean;
	reporter?: string;
	error?: string;
} {
	const vars = parseVars(args);
	const noScreenshots = args.includes("--no-screenshots");
	let reporter: string | undefined;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--reporter") {
			if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
				return {
					vars,
					noScreenshots,
					error: `Missing value for --reporter. Valid reporters: ${VALID_REPORTERS.join(", ")}`,
				};
			}
			reporter = args[i + 1];
			if (!VALID_REPORTERS.includes(reporter)) {
				return {
					vars,
					noScreenshots,
					error: `Invalid reporter '${reporter}'. Valid reporters: ${VALID_REPORTERS.join(", ")}`,
				};
			}
			break;
		}
	}
	return { vars, noScreenshots, reporter };
}

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function generateHealthcheckScreenshotPath(pageName: string): string {
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

	const slug = slugify(pageName);
	return join(dir, `healthcheck-${slug}-${timestamp}.png`);
}

type PageResult = {
	name: string;
	url: string;
	passed: boolean;
	screenshotPath?: string;
	consoleErrors: ConsoleEntry[];
	assertionResults: { label: string; passed: boolean; reason?: string }[];
	error?: string;
};

export async function handleHealthcheck(
	config: BrowseConfig | null,
	page: Page,
	args: string[],
	deps: HealthcheckDeps | null,
): Promise<Response> {
	if (!config) {
		return {
			ok: false,
			error: "No browse.config.json found. Create one with healthcheck pages.",
		};
	}

	if (
		!config.healthcheck ||
		!config.healthcheck.pages ||
		config.healthcheck.pages.length === 0
	) {
		return {
			ok: false,
			error: "No healthcheck pages defined in browse.config.json.",
		};
	}

	const parsed = parseHealthcheckArgs(args);
	if (parsed.error) {
		return { ok: false, error: parsed.error };
	}
	const { vars, noScreenshots, reporter } = parsed;
	const pages = config.healthcheck.pages;
	const startTime = Date.now();
	const results: PageResult[] = [];
	const allScreenshots: string[] = [];

	for (const pageConfig of pages) {
		const url = interpolateVars(pageConfig.url, vars);
		const name = pageConfig.name ?? url.replace(/^https?:\/\/[^/]+/, "");
		const shouldScreenshot = !noScreenshots && pageConfig.screenshot !== false;
		const consoleLevel = pageConfig.console ?? "error";

		const result: PageResult = {
			name,
			url,
			passed: true,
			consoleErrors: [],
			assertionResults: [],
		};

		// Drain console buffer before navigation
		if (deps) {
			deps.consoleBuffer.drain();
		}

		// Navigate
		try {
			await page.goto(url, {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			result.passed = false;
			result.error = `Navigation failed: ${message}`;
			results.push(result);
			continue;
		}

		// Screenshot
		if (shouldScreenshot) {
			try {
				const screenshotPath = generateHealthcheckScreenshotPath(name);
				await page.screenshot({ path: screenshotPath, fullPage: true });
				result.screenshotPath = screenshotPath;
				allScreenshots.push(screenshotPath);
			} catch {
				// Screenshot failure doesn't fail the page
			}
		}

		// Check console
		if (deps) {
			// Small delay for console messages to be captured
			await new Promise((resolve) => setTimeout(resolve, 200));
			const entries = deps.consoleBuffer.drain(
				(entry) => entry.level === consoleLevel,
			);
			if (entries.length > 0) {
				result.consoleErrors = entries;
				result.passed = false;
			}
		}

		// Run assertions
		if (pageConfig.assertions) {
			for (const condition of pageConfig.assertions) {
				const assertResult = await evaluateAssertCondition(page, condition);
				const label = formatAssertLabel(condition);
				result.assertionResults.push({
					label,
					passed: assertResult.passed,
					reason: assertResult.passed ? undefined : assertResult.reason,
				});
				if (!assertResult.passed) {
					result.passed = false;
				}
			}
		}

		results.push(result);
	}

	const passedCount = results.filter((r) => r.passed).length;
	const totalCount = results.length;
	const allPassed = passedCount === totalCount;
	const durationMs = Date.now() - startTime;

	if (reporter === "junit") {
		const junit = formatHealthcheckJUnit(results, durationMs);
		return { ok: true, data: junit };
	}

	const report = formatHealthcheckReport(results, allScreenshots);

	if (allPassed) {
		return { ok: true, data: report };
	}
	return { ok: false, error: report };
}

function formatAssertLabel(condition: AssertCondition): string {
	if ("visible" in condition) return `visible "${condition.visible}"`;
	if ("notVisible" in condition) return `notVisible "${condition.notVisible}"`;
	if ("textContains" in condition)
		return `textContains "${condition.textContains}"`;
	if ("textNotContains" in condition)
		return `textNotContains "${condition.textNotContains}"`;
	if ("urlContains" in condition)
		return `urlContains "${condition.urlContains}"`;
	if ("urlPattern" in condition) return `urlPattern "${condition.urlPattern}"`;
	if ("elementText" in condition)
		return `elementText "${condition.elementText.selector}"`;
	if ("elementCount" in condition)
		return `elementCount "${condition.elementCount.selector}"`;
	return "unknown";
}

function formatHealthcheckReport(
	results: PageResult[],
	screenshots: string[],
): string {
	const passedCount = results.filter((r) => r.passed).length;
	const totalCount = results.length;
	const lines: string[] = [];

	lines.push(`Healthcheck: ${passedCount}/${totalCount} pages passed`);
	lines.push("");

	for (const result of results) {
		const mark = result.passed ? "✓" : "✗";
		lines.push(`  ${mark} ${result.name} (${result.url})`);

		if (result.error) {
			lines.push(`    ${result.error}`);
		}

		if (result.screenshotPath) {
			lines.push(`    Screenshot: ${result.screenshotPath}`);
		}

		if (result.assertionResults.length > 0) {
			const assertPassed = result.assertionResults.filter(
				(a) => a.passed,
			).length;
			lines.push(
				`    Assertions: ${assertPassed}/${result.assertionResults.length} passed`,
			);
			for (const ar of result.assertionResults) {
				if (!ar.passed && ar.reason) {
					lines.push(`      ✗ ${ar.label}: ${ar.reason}`);
				}
			}
		}

		if (result.consoleErrors.length > 0) {
			lines.push("    Console errors:");
			const formatted = formatConsoleEntries(result.consoleErrors);
			for (const line of formatted.split("\n")) {
				lines.push(`      ${line}`);
			}
		} else if (!result.error) {
			lines.push("    Console: clean");
		}
	}

	if (screenshots.length > 0) {
		lines.push("");
		lines.push("Screenshots:");
		for (const result of results) {
			if (result.screenshotPath) {
				lines.push(`  ${result.name}: ${result.screenshotPath}`);
			}
		}
	}

	return lines.join("\n");
}
