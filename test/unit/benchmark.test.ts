import { describe, expect, mock, test } from "bun:test";
import {
	type BenchmarkDeps,
	computePercentiles,
	formatBenchmarkResults,
	handleBenchmark,
	parseIterations,
} from "../../src/commands/benchmark.ts";

describe("parseIterations", () => {
	test("returns default 10 when no args", () => {
		expect(parseIterations([])).toBe(10);
	});

	test("parses --iterations flag", () => {
		expect(parseIterations(["--iterations", "20"])).toBe(20);
	});

	test("returns default for invalid number", () => {
		expect(parseIterations(["--iterations", "abc"])).toBe(10);
	});

	test("returns default when --iterations has no value", () => {
		expect(parseIterations(["--iterations"])).toBe(10);
	});
});

describe("computePercentiles", () => {
	test("computes p50, p95, p99 from sorted array", () => {
		// 100 values: 1, 2, ..., 100
		const values = Array.from({ length: 100 }, (_, i) => i + 1);
		const result = computePercentiles(values);

		expect(result.p50).toBe(51);
		expect(result.p95).toBe(96);
		expect(result.p99).toBe(100);
	});

	test("handles single value", () => {
		const result = computePercentiles([42]);
		expect(result.p50).toBe(42);
		expect(result.p95).toBe(42);
		expect(result.p99).toBe(42);
	});

	test("handles two values", () => {
		const result = computePercentiles([10, 20]);
		expect(result.p50).toBe(20);
		expect(result.p95).toBe(20);
		expect(result.p99).toBe(20);
	});
});

describe("formatBenchmarkResults", () => {
	test("formats results with aligned columns", () => {
		const results = [
			{ name: "goto (local)", p50: 12, p95: 18, p99: 22 },
			{ name: "snapshot", p50: 8, p95: 14, p99: 19 },
		];

		const output = formatBenchmarkResults(results, 10);
		expect(output).toContain("Benchmark (10 iterations each)");
		expect(output).toContain("goto (local)");
		expect(output).toContain("snapshot");
		expect(output).toContain("p50:");
		expect(output).toContain("p95:");
		expect(output).toContain("p99:");
	});

	test("includes target line", () => {
		const output = formatBenchmarkResults([], 5);
		expect(output).toContain("Target: p95 < 200ms");
	});
});

describe("handleBenchmark", () => {
	function mockTempPage() {
		return {
			goto: mock(() => Promise.resolve()),
			title: mock(() => Promise.resolve("Test")),
			screenshot: mock(() => Promise.resolve(Buffer.from(""))),
			locator: mock(() => ({
				click: mock(() => Promise.resolve()),
				fill: mock(() => Promise.resolve()),
				ariaSnapshot: mock(() => Promise.resolve('- button "Test"')),
			})),
			close: mock(() => Promise.resolve()),
		};
	}

	function makeDeps(tempPage = mockTempPage()): BenchmarkDeps {
		return {
			context: {
				newPage: mock(() => Promise.resolve(tempPage)),
			} as never,
		};
	}

	test("completes without error", async () => {
		const deps = makeDeps();
		const result = await handleBenchmark(deps, ["--iterations", "2"]);

		expect(result.ok).toBe(true);
	});

	test("output contains all expected operations", async () => {
		const deps = makeDeps();
		const result = await handleBenchmark(deps, ["--iterations", "2"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("goto (local)");
			expect(result.data).toContain("snapshot");
			expect(result.data).toContain("screenshot");
			expect(result.data).toContain("click");
			expect(result.data).toContain("fill");
		}
	});

	test("output contains percentile values", async () => {
		const deps = makeDeps();
		const result = await handleBenchmark(deps, ["--iterations", "2"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("p50:");
			expect(result.data).toContain("p95:");
			expect(result.data).toContain("p99:");
		}
	});

	test("respects --iterations flag", async () => {
		const deps = makeDeps();
		const result = await handleBenchmark(deps, ["--iterations", "3"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("3 iterations");
		}
	});

	test("returns structured JSON when requested", async () => {
		const deps = makeDeps();
		const result = await handleBenchmark(deps, ["--iterations", "2"], {
			json: true,
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			const parsed = JSON.parse(result.data) as {
				iterations: number;
				target: string;
				results: Array<{ name: string; p50: number; p95: number; p99: number }>;
			};
			expect(parsed.iterations).toBe(2);
			expect(parsed.target).toContain("p95 < 200ms");
			expect(parsed.results.some((entry) => entry.name === "snapshot")).toBe(
				true,
			);
		}
	});

	test("uses a temporary page from context, not the main page", async () => {
		const tempPage = {
			goto: mock(() => Promise.resolve()),
			screenshot: mock(() => Promise.resolve(Buffer.from(""))),
			locator: mock(() => ({
				click: mock(() => Promise.resolve()),
				fill: mock(() => Promise.resolve()),
				ariaSnapshot: mock(() => Promise.resolve('- button "Test"')),
			})),
			close: mock(() => Promise.resolve()),
		};
		const contextMock = {
			newPage: mock(() => Promise.resolve(tempPage)),
		};
		const deps: BenchmarkDeps = {
			context: contextMock as never,
		};

		const result = await handleBenchmark(deps, ["--iterations", "2"]);

		expect(result.ok).toBe(true);
		// Should have created a new page from context
		expect(contextMock.newPage).toHaveBeenCalled();
		// Should have used the temp page for navigation
		expect(tempPage.goto).toHaveBeenCalled();
		// Should have closed the temp page after benchmark
		expect(tempPage.close).toHaveBeenCalled();
	});

	test("closes temporary page even when benchmark fails", async () => {
		const tempPage = {
			goto: mock(() => Promise.reject(new Error("goto failed"))),
			close: mock(() => Promise.resolve()),
		};
		const contextMock = {
			newPage: mock(() => Promise.resolve(tempPage)),
		};
		const deps: BenchmarkDeps = {
			context: contextMock as never,
		};

		const result = await handleBenchmark(deps, ["--iterations", "1"]);

		expect(result.ok).toBe(false);
		// Must close temp page even on failure
		expect(tempPage.close).toHaveBeenCalled();
	});
});
