import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { assignRefs, parseAriaSnapshot } from "../refs.ts";

export type BenchmarkDeps = {
	page: Page;
};

const TEST_PAGE = `data:text/html,<html><body>
<h1>Benchmark</h1>
<form>
<input type="text" name="query" placeholder="Search...">
<button type="button">Submit</button>
<a href="#">Link</a>
</form>
</body></html>`;

export function parseIterations(args: string[]): number {
	const idx = args.indexOf("--iterations");
	if (idx === -1 || idx + 1 >= args.length) return 10;

	const val = Number.parseInt(args[idx + 1], 10);
	return Number.isNaN(val) || val <= 0 ? 10 : val;
}

export function computePercentiles(sorted: number[]): {
	p50: number;
	p95: number;
	p99: number;
} {
	const len = sorted.length;
	return {
		p50: sorted[Math.floor(len * 0.5)] ?? sorted[len - 1],
		p95: sorted[Math.floor(len * 0.95)] ?? sorted[len - 1],
		p99: sorted[Math.floor(len * 0.99)] ?? sorted[len - 1],
	};
}

export function formatBenchmarkResults(
	results: { name: string; p50: number; p95: number; p99: number }[],
	iterations: number,
): string {
	const lines = [`Benchmark (${iterations} iterations each):`, ""];

	const maxName = Math.max(...results.map((r) => r.name.length), 0);

	for (const r of results) {
		const pad = r.name.padEnd(maxName);
		lines.push(
			`  ${pad}  p50: ${String(r.p50).padStart(4)}ms   p95: ${String(r.p95).padStart(4)}ms   p99: ${String(r.p99).padStart(4)}ms`,
		);
	}

	lines.push("");
	lines.push("Target: p95 < 200ms for non-screenshot commands.");

	return lines.join("\n");
}

async function measureOp(
	fn: () => Promise<void>,
	iterations: number,
): Promise<number[]> {
	const durations: number[] = [];
	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		await fn();
		durations.push(Math.round(performance.now() - start));
	}
	return durations.sort((a, b) => a - b);
}

export async function handleBenchmark(
	deps: BenchmarkDeps,
	args: string[],
): Promise<Response> {
	const { page } = deps;
	const iterations = parseIterations(args);
	const screenshotPath = join(tmpdir(), "browse-benchmark.png");

	try {
		// Navigate to test page
		await page.goto(TEST_PAGE);

		const results: { name: string; p50: number; p95: number; p99: number }[] =
			[];

		// goto (local)
		const gotoLocal = await measureOp(
			() => page.goto(TEST_PAGE).then(() => {}),
			iterations,
		);
		results.push({ name: "goto (local)", ...computePercentiles(gotoLocal) });

		// snapshot
		const snapshotDurations = await measureOp(async () => {
			const snapshot = await page.ariaSnapshot();
			const tree = parseAriaSnapshot(snapshot);
			assignRefs(tree, "default");
		}, iterations);
		results.push({
			name: "snapshot",
			...computePercentiles(snapshotDurations),
		});

		// screenshot
		const screenshotDurations = await measureOp(
			() => page.screenshot({ path: screenshotPath }).then(() => {}),
			iterations,
		);
		results.push({
			name: "screenshot",
			...computePercentiles(screenshotDurations),
		});

		// click — use a button on the test page
		const clickDurations = await measureOp(async () => {
			await page.locator("button").click();
		}, iterations);
		results.push({ name: "click", ...computePercentiles(clickDurations) });

		// fill — use an input on the test page
		const fillDurations = await measureOp(async () => {
			await page.locator("input[name=query]").fill("test");
		}, iterations);
		results.push({ name: "fill", ...computePercentiles(fillDurations) });

		return { ok: true, data: formatBenchmarkResults(results, iterations) };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `Benchmark failed: ${message}` };
	}
}
