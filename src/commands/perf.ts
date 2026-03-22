import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

type PerfMetrics = {
	ttfb: number;
	fcp: number;
	lcp: number;
	cls: number;
	domContentLoaded: number;
	load: number;
	resourceCount: number;
	transferSize: number;
};

type BudgetRule = {
	metric: string;
	threshold: number;
};

export function parseBudget(args: string[]): BudgetRule[] {
	const idx = args.indexOf("--budget");
	if (idx === -1 || idx + 1 >= args.length) return [];

	const raw = args[idx + 1];
	const rules: BudgetRule[] = [];

	for (const part of raw.split(",")) {
		const [metric, value] = part.split("=");
		if (metric && value) {
			const threshold = Number.parseFloat(value);
			if (!Number.isNaN(threshold)) {
				rules.push({ metric: metric.trim(), threshold });
			}
		}
	}

	return rules;
}

export function formatPerfResults(
	metrics: PerfMetrics,
	budget: BudgetRule[],
): string {
	const lines: string[] = [];

	lines.push("Performance Metrics:");
	lines.push("");
	lines.push(
		`  TTFB              ${formatMs(metrics.ttfb)}${budgetIndicator("ttfb", metrics.ttfb, budget)}`,
	);
	lines.push(
		`  FCP               ${formatMs(metrics.fcp)}${budgetIndicator("fcp", metrics.fcp, budget)}`,
	);
	lines.push(
		`  LCP               ${formatMs(metrics.lcp)}${budgetIndicator("lcp", metrics.lcp, budget)}`,
	);
	lines.push(
		`  CLS               ${metrics.cls.toFixed(3)}${budgetIndicator("cls", metrics.cls, budget)}`,
	);
	lines.push(
		`  DOM Content Loaded ${formatMs(metrics.domContentLoaded)}${budgetIndicator("dcl", metrics.domContentLoaded, budget)}`,
	);
	lines.push(
		`  Page Load         ${formatMs(metrics.load)}${budgetIndicator("load", metrics.load, budget)}`,
	);
	lines.push("");
	lines.push(`  Resources         ${metrics.resourceCount}`);
	lines.push(`  Transfer Size     ${formatBytes(metrics.transferSize)}`);

	if (budget.length > 0) {
		const failures = checkBudget(metrics, budget);
		lines.push("");
		if (failures.length === 0) {
			lines.push("Budget: all metrics within thresholds.");
		} else {
			lines.push(
				`Budget: ${failures.length} violation${failures.length === 1 ? "" : "s"}`,
			);
			for (const f of failures) {
				lines.push(
					`  FAIL ${f.metric}: ${f.actual} (threshold: ${f.threshold})`,
				);
			}
		}
	}

	return lines.join("\n");
}

function formatMs(ms: number): string {
	if (ms < 0) return "N/A";
	return `${Math.round(ms)}ms`;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

type BudgetFailure = {
	metric: string;
	actual: string;
	threshold: string;
};

function getMetricValue(
	metrics: PerfMetrics,
	metric: string,
): number | undefined {
	const map: Record<string, number> = {
		ttfb: metrics.ttfb,
		fcp: metrics.fcp,
		lcp: metrics.lcp,
		cls: metrics.cls,
		dcl: metrics.domContentLoaded,
		load: metrics.load,
	};
	return map[metric];
}

export function checkBudget(
	metrics: PerfMetrics,
	budget: BudgetRule[],
): BudgetFailure[] {
	const failures: BudgetFailure[] = [];
	const validMetrics = new Set(["ttfb", "fcp", "lcp", "cls", "dcl", "load"]);

	for (const rule of budget) {
		if (!validMetrics.has(rule.metric)) {
			failures.push({
				metric: rule.metric.toUpperCase(),
				actual: "N/A",
				threshold: String(rule.threshold),
			});
			continue;
		}

		const value = getMetricValue(metrics, rule.metric);
		if (value === undefined || value < 0) {
			failures.push({
				metric: rule.metric.toUpperCase(),
				actual: "unavailable",
				threshold: String(rule.threshold),
			});
			continue;
		}

		if (value > rule.threshold) {
			const isMs = rule.metric !== "cls";
			failures.push({
				metric: rule.metric.toUpperCase(),
				actual: isMs ? `${Math.round(value)}ms` : value.toFixed(3),
				threshold: isMs
					? `${Math.round(rule.threshold)}ms`
					: rule.threshold.toFixed(3),
			});
		}
	}

	return failures;
}

function budgetIndicator(
	metric: string,
	value: number,
	budget: BudgetRule[],
): string {
	const rule = budget.find((r) => r.metric === metric);
	if (!rule) return "";
	if (value < 0) return "";
	return value <= rule.threshold ? " [PASS]" : " [FAIL]";
}

export async function handlePerf(
	page: Page,
	args: string[],
	options?: { json?: boolean },
): Promise<Response> {
	const jsonOutput = options?.json ?? false;
	const budget = parseBudget(args);

	try {
		const metrics = await page.evaluate(() => {
			const nav = performance.getEntriesByType("navigation")[0] as
				| PerformanceNavigationTiming
				| undefined;
			const paintEntries = performance.getEntriesByType("paint");
			const resources = performance.getEntriesByType(
				"resource",
			) as PerformanceResourceTiming[];

			const fcp =
				paintEntries.find((e) => e.name === "first-contentful-paint")
					?.startTime ?? -1;

			// LCP from PerformanceObserver entries (best effort)
			let lcp = -1;
			try {
				const lcpEntries = performance.getEntriesByType(
					"largest-contentful-paint",
				);
				if (lcpEntries.length > 0) {
					lcp = lcpEntries[lcpEntries.length - 1].startTime;
				}
			} catch {
				// LCP entries may not be available
			}

			// CLS from layout-shift entries
			let cls = 0;
			try {
				const layoutShifts = performance.getEntriesByType("layout-shift");
				for (const entry of layoutShifts) {
					const shiftEntry = entry as PerformanceEntry & {
						hadRecentInput?: boolean;
						value?: number;
					};
					if (!shiftEntry.hadRecentInput && shiftEntry.value) {
						cls += shiftEntry.value;
					}
				}
			} catch {
				// Layout shift entries may not be available
			}

			const ttfb = nav ? nav.responseStart - nav.requestStart : -1;
			const domContentLoaded = nav
				? nav.domContentLoadedEventEnd - nav.startTime
				: -1;
			const load = nav ? nav.loadEventEnd - nav.startTime : -1;

			let transferSize = 0;
			for (const r of resources) {
				transferSize += r.transferSize || 0;
			}

			return {
				ttfb,
				fcp,
				lcp,
				cls,
				domContentLoaded,
				load,
				resourceCount: resources.length,
				transferSize,
			};
		});

		if (jsonOutput) {
			const result: Record<string, unknown> = { metrics };
			if (budget.length > 0) {
				const failures = checkBudget(metrics, budget);
				result.budget = {
					rules: budget,
					failures,
					pass: failures.length === 0,
				};
			}
			return { ok: true, data: JSON.stringify(result) };
		}

		return { ok: true, data: formatPerfResults(metrics, budget) };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `Performance measurement failed: ${message}` };
	}
}
