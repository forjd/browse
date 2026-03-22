import { describe, expect, mock, test } from "bun:test";
import {
	checkBudget,
	formatPerfResults,
	handlePerf,
	parseBudget,
} from "../src/commands/perf.ts";

function makeMetrics(overrides: Record<string, number> = {}) {
	return {
		ttfb: 120,
		fcp: 800,
		lcp: 2200,
		cls: 0.05,
		domContentLoaded: 600,
		load: 3000,
		resourceCount: 42,
		transferSize: 1_500_000,
		...overrides,
	};
}

describe("parseBudget", () => {
	test("parses comma-separated budget rules", () => {
		const rules = parseBudget(["--budget", "lcp=2500,cls=0.1,fcp=1800"]);
		expect(rules).toEqual([
			{ metric: "lcp", threshold: 2500 },
			{ metric: "cls", threshold: 0.1 },
			{ metric: "fcp", threshold: 1800 },
		]);
	});

	test("returns empty array when no --budget flag", () => {
		expect(parseBudget([])).toEqual([]);
		expect(parseBudget(["--json"])).toEqual([]);
	});

	test("returns empty array when --budget has no value", () => {
		expect(parseBudget(["--budget"])).toEqual([]);
	});
});

describe("checkBudget", () => {
	test("returns empty array when all within budget", () => {
		const metrics = makeMetrics({ lcp: 2000, cls: 0.05 });
		const budget = [
			{ metric: "lcp", threshold: 2500 },
			{ metric: "cls", threshold: 0.1 },
		];
		expect(checkBudget(metrics, budget)).toEqual([]);
	});

	test("returns failures for exceeded metrics", () => {
		const metrics = makeMetrics({ lcp: 3000, cls: 0.2 });
		const budget = [
			{ metric: "lcp", threshold: 2500 },
			{ metric: "cls", threshold: 0.1 },
		];
		const failures = checkBudget(metrics, budget);
		expect(failures).toHaveLength(2);
		expect(failures[0].metric).toBe("LCP");
		expect(failures[1].metric).toBe("CLS");
	});

	test("reports unknown metric names as failures", () => {
		const metrics = makeMetrics();
		const budget = [{ metric: "unknown", threshold: 100 }];
		const failures = checkBudget(metrics, budget);
		expect(failures).toHaveLength(1);
		expect(failures[0].metric).toBe("UNKNOWN");
		expect(failures[0].actual).toBe("N/A");
	});
});

describe("formatPerfResults", () => {
	test("formats metrics without budget", () => {
		const output = formatPerfResults(makeMetrics(), []);
		expect(output).toContain("Performance Metrics:");
		expect(output).toContain("TTFB");
		expect(output).toContain("FCP");
		expect(output).toContain("LCP");
		expect(output).toContain("CLS");
		expect(output).toContain("120ms");
		expect(output).toContain("0.050");
		expect(output).toContain("42");
	});

	test("includes budget indicators when budget provided", () => {
		const budget = [
			{ metric: "lcp", threshold: 2500 },
			{ metric: "cls", threshold: 0.01 },
		];
		const output = formatPerfResults(makeMetrics(), budget);
		expect(output).toContain("[PASS]");
		expect(output).toContain("[FAIL]");
		expect(output).toContain("1 violation");
	});
});

describe("handlePerf", () => {
	test("returns performance metrics", async () => {
		const page = {
			evaluate: mock(() => Promise.resolve(makeMetrics())),
		} as never;

		const result = await handlePerf(page, []);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Performance Metrics:");
			expect(result.data).toContain("LCP");
		}
	});

	test("returns JSON when --json flag used", async () => {
		const page = {
			evaluate: mock(() => Promise.resolve(makeMetrics())),
		} as never;

		const result = await handlePerf(page, [], { json: true });
		expect(result.ok).toBe(true);
		if (result.ok) {
			const parsed = JSON.parse(result.data);
			expect(parsed.metrics.lcp).toBe(2200);
			expect(parsed.metrics.fcp).toBe(800);
		}
	});

	test("includes budget results in JSON", async () => {
		const page = {
			evaluate: mock(() => Promise.resolve(makeMetrics({ lcp: 3000 }))),
		} as never;

		const result = await handlePerf(page, ["--budget", "lcp=2500"], {
			json: true,
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			const parsed = JSON.parse(result.data);
			expect(parsed.budget.pass).toBe(false);
			expect(parsed.budget.failures).toHaveLength(1);
		}
	});

	test("handles page.evaluate failure", async () => {
		const page = {
			evaluate: mock(() => Promise.reject(new Error("Page crashed"))),
		} as never;

		const result = await handlePerf(page, []);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Page crashed");
		}
	});
});
