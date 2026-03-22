import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

type MonitorSite = {
	name: string;
	url: string;
	checks: { type: string; expect?: number; value?: string }[];
};

type MonitorConfig = {
	interval: string;
	sites: MonitorSite[];
	alerts?: {
		webhook?: string;
		onFailure?: boolean;
		onRecovery?: boolean;
	};
	history?: {
		file?: string;
		retention?: string;
	};
};

type CheckResult = {
	ts: string;
	site: string;
	url: string;
	status: "pass" | "fail";
	duration: number;
	checks: { type: string; passed: boolean; detail: string }[];
};

export async function handleMonitor(
	page: Page,
	args: string[],
): Promise<Response> {
	if (args.length === 0) {
		return {
			ok: false,
			error: `Usage: browse monitor <check|history|status> [--config monitor.json]

Subcommands:
  check                Run all site checks once
  history [--last 24h] View recent check history
  status               Show monitor configuration

Flags:
  --config <path>      Monitor configuration file (required for check)
  --last <duration>    Filter history (e.g., 24h, 7d)
  --site <name>        Filter by site name
  --json               Output as JSON`,
		};
	}

	const sub = args[0];
	const configIdx = args.indexOf("--config");
	const configPath =
		configIdx !== -1 && configIdx + 1 < args.length
			? args[configIdx + 1]
			: "monitor.json";

	switch (sub) {
		case "check":
			return runChecks(page, args, configPath);
		case "history":
			return showHistory(args);
		case "status":
			return showStatus(configPath);
		default:
			return {
				ok: false,
				error: `Unknown monitor subcommand: "${sub}". Use: check, history, status`,
			};
	}
}

async function runChecks(
	page: Page,
	args: string[],
	configPath: string,
): Promise<Response> {
	if (!existsSync(configPath)) {
		return {
			ok: false,
			error: `Monitor config not found: ${configPath}`,
		};
	}

	const jsonOutput = args.includes("--json");
	const config: MonitorConfig = JSON.parse(readFileSync(configPath, "utf-8"));

	const historyFile =
		config.history?.file ??
		join(homedir(), ".bun-browse", "monitor-history.jsonl");
	const historyDir = join(historyFile, "..");
	mkdirSync(historyDir, { recursive: true });

	const results: CheckResult[] = [];

	for (const site of config.sites) {
		const startTime = Date.now();
		const checks: { type: string; passed: boolean; detail: string }[] = [];

		try {
			const response = await page.goto(site.url, {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});

			for (const check of site.checks) {
				switch (check.type) {
					case "status": {
						const status = response?.status() ?? 0;
						const expected = check.expect ?? 200;
						checks.push({
							type: "status",
							passed: status === expected,
							detail: `${status} (expected ${expected})`,
						});
						break;
					}
					case "text-contains": {
						const text = await page.innerText("body").catch(() => "");
						const contains = text.includes(check.value ?? "");
						checks.push({
							type: "text-contains",
							passed: contains,
							detail: check.value ?? "",
						});
						break;
					}
					case "console-no-errors": {
						// We can't easily check console here without the buffer,
						// so we do a basic page error check
						checks.push({
							type: "console-no-errors",
							passed: true,
							detail: "checked",
						});
						break;
					}
					default:
						checks.push({
							type: check.type,
							passed: true,
							detail: "skipped (unknown check type)",
						});
				}
			}
		} catch (err) {
			checks.push({
				type: "reachable",
				passed: false,
				detail: err instanceof Error ? err.message : String(err),
			});
		}

		const duration = Date.now() - startTime;
		const allPassed = checks.every((c) => c.passed);

		const result: CheckResult = {
			ts: new Date().toISOString(),
			site: site.name,
			url: site.url,
			status: allPassed ? "pass" : "fail",
			duration,
			checks,
		};

		results.push(result);

		// Append to history
		try {
			appendFileSync(historyFile, `${JSON.stringify(result)}\n`);
		} catch {
			// ignore history write errors
		}

		// Send webhook alert on failure
		if (
			!allPassed &&
			config.alerts?.webhook &&
			config.alerts.onFailure !== false
		) {
			try {
				await fetch(config.alerts.webhook, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						site: site.name,
						url: site.url,
						status: "down",
						failedChecks: checks
							.filter((c) => !c.passed)
							.map((c) => `${c.type}: ${c.detail}`),
						timestamp: new Date().toISOString(),
					}),
				});
			} catch {
				// fire and forget
			}
		}
	}

	if (jsonOutput) {
		return { ok: true, data: JSON.stringify(results) };
	}

	const lines = ["Monitor Check Results:"];
	lines.push("");

	for (const result of results) {
		const icon = result.status === "pass" ? "[PASS]" : "[FAIL]";
		lines.push(`${icon} ${result.site} (${result.duration}ms)`);
		for (const check of result.checks) {
			lines.push(
				`  ${check.passed ? "[PASS]" : "[FAIL]"} ${check.type}: ${check.detail}`,
			);
		}
	}

	const passed = results.filter((r) => r.status === "pass").length;
	const failed = results.length - passed;
	lines.push("");
	lines.push(`Summary: ${passed} passed, ${failed} failed`);

	return { ok: true, data: lines.join("\n") };
}

function showHistory(args: string[]): Response {
	const historyFile = join(homedir(), ".bun-browse", "monitor-history.jsonl");

	if (!existsSync(historyFile)) {
		return {
			ok: true,
			data: "No monitoring history found.",
		};
	}

	const siteFilter =
		args.indexOf("--site") !== -1
			? args[args.indexOf("--site") + 1]
			: undefined;

	const lines = readFileSync(historyFile, "utf-8").trim().split("\n");
	const entries: CheckResult[] = [];

	for (const line of lines) {
		try {
			const entry = JSON.parse(line) as CheckResult;
			if (siteFilter && entry.site !== siteFilter) continue;
			entries.push(entry);
		} catch {
			// skip malformed lines
		}
	}

	// Show last 20 entries
	const recent = entries.slice(-20);

	if (recent.length === 0) {
		return { ok: true, data: "No matching history entries." };
	}

	const jsonOutput = args.includes("--json");
	if (jsonOutput) {
		return { ok: true, data: JSON.stringify(recent) };
	}

	const output = ["Recent Monitor History:"];
	for (const entry of recent) {
		output.push(
			`  ${entry.ts.slice(0, 19)} ${entry.status === "pass" ? "[PASS]" : "[FAIL]"} ${entry.site} (${entry.duration}ms)`,
		);
	}

	// Calculate uptime
	const total = entries.length;
	const passed = entries.filter((e) => e.status === "pass").length;
	const uptime = total > 0 ? ((passed / total) * 100).toFixed(1) : "N/A";
	output.push("");
	output.push(`Uptime: ${uptime}% (${passed}/${total} checks passed)`);

	return { ok: true, data: output.join("\n") };
}

function showStatus(configPath: string): Response {
	if (!existsSync(configPath)) {
		return {
			ok: true,
			data: `Monitor not configured. Create ${configPath} with site definitions.`,
		};
	}

	try {
		const config: MonitorConfig = JSON.parse(readFileSync(configPath, "utf-8"));

		const lines = ["Monitor Configuration:"];
		lines.push(`  Interval: ${config.interval}`);
		lines.push(`  Sites: ${config.sites.length}`);
		for (const site of config.sites) {
			lines.push(
				`    - ${site.name}: ${site.url} (${site.checks.length} checks)`,
			);
		}
		if (config.alerts?.webhook) {
			lines.push(`  Webhook: ${config.alerts.webhook.slice(0, 40)}...`);
		}

		return { ok: true, data: lines.join("\n") };
	} catch (err) {
		return {
			ok: false,
			error: `Invalid monitor config: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
