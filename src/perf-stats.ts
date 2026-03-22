/**
 * Statistical utilities for performance regression detection.
 */

export function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = (p / 100) * (sorted.length - 1);
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	if (lower === upper) return sorted[lower];
	const frac = index - lower;
	return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

export function mean(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stdev(values: number[]): number {
	if (values.length < 2) return 0;
	const avg = mean(values);
	const variance =
		values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
	return Math.sqrt(variance);
}

export type MetricStats = {
	p50: number;
	p95: number;
	mean: number;
	stdev: number;
	values: number[];
};

export function computeStats(values: number[]): MetricStats {
	return {
		p50: percentile(values, 50),
		p95: percentile(values, 95),
		mean: mean(values),
		stdev: stdev(values),
		values,
	};
}

export type BaselineData = {
	url: string;
	timestamp: string;
	runs: number;
	metrics: Record<string, MetricStats>;
	environment?: {
		throttle?: string;
		browser?: string;
		viewport?: string;
	};
};

export type RegressionResult = {
	metric: string;
	baselineP50: number;
	currentP50: number;
	deltaPercent: number;
	isRegression: boolean;
	status: "improved" | "regression" | "within-noise";
};

/**
 * Determine if current metrics represent a regression vs baseline.
 * A regression is flagged when:
 *   - p50 increases by more than `thresholdPercent`
 *   - AND the change is greater than 2x the baseline stdev (statistical significance)
 */
export function detectRegressions(
	baseline: Record<string, MetricStats>,
	current: Record<string, MetricStats>,
	thresholdPercent = 10,
): RegressionResult[] {
	const results: RegressionResult[] = [];

	for (const metric of Object.keys(baseline)) {
		const b = baseline[metric];
		const c = current[metric];
		if (!c) continue;

		const delta = c.p50 - b.p50;
		const deltaPercent = b.p50 > 0 ? (delta / b.p50) * 100 : 0;
		const significantChange = Math.abs(delta) > 2 * b.stdev;

		let status: RegressionResult["status"];
		if (deltaPercent > thresholdPercent && significantChange) {
			status = "regression";
		} else if (deltaPercent < -thresholdPercent && significantChange) {
			status = "improved";
		} else {
			status = "within-noise";
		}

		results.push({
			metric,
			baselineP50: b.p50,
			currentP50: c.p50,
			deltaPercent: Math.round(deltaPercent * 10) / 10,
			isRegression: status === "regression",
			status,
		});
	}

	return results;
}
