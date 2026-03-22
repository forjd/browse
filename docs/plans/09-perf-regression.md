# Plan 09: Performance Regression Detection

**Priority:** Tier 2 — Medium Impact
**Personas:** Performance Engineer, DevOps Engineer, Frontend Developer
**New sub-commands:** `perf baseline`, `perf compare`, `perf trend`

---

## Problem

`perf` gives a single-shot reading of Core Web Vitals. There's no way to: run multiple iterations for statistical significance, save baselines, compare against them, or detect regressions over time. Performance engineers need confidence intervals, not single data points.

## Design

### Command Interface

```bash
# Save a performance baseline (runs N iterations, computes stats)
browse perf baseline --url https://example.com --runs 5 --out perf-baseline.json

# Compare current against baseline
browse perf compare --baseline perf-baseline.json [--url https://example.com] [--runs 5]

# Record a data point to a trend file
browse perf trend --url https://example.com --file perf-trend.jsonl [--label "v2.3.1"]

# View trend summary
browse perf trend --file perf-trend.jsonl --summary

# Existing perf command unchanged
browse perf [--budget lcp=2500,cls=0.1]
```

### Baseline File Format (`perf-baseline.json`)

```json
{
  "url": "https://example.com",
  "timestamp": "2026-03-22T10:00:00Z",
  "runs": 5,
  "metrics": {
    "lcp": { "p50": 1200, "p95": 1800, "mean": 1350, "stdev": 210, "values": [1100, 1200, 1300, 1400, 1750] },
    "cls": { "p50": 0.05, "p95": 0.08, "mean": 0.055, "stdev": 0.012, "values": [0.04, 0.05, 0.05, 0.06, 0.075] },
    "fcp": { "p50": 800, "p95": 1100, "mean": 870, "stdev": 120, "values": [700, 800, 850, 900, 1100] },
    "ttfb": { "p50": 150, "p95": 220, "mean": 165, "stdev": 30, "values": [130, 150, 160, 170, 215] },
    "dcl": { "p50": 1000, "p95": 1300, "mean": 1050, "stdev": 100, "values": [900, 1000, 1050, 1100, 1200] },
    "load": { "p50": 2000, "p95": 2500, "mean": 2100, "stdev": 200, "values": [1800, 2000, 2100, 2200, 2400] }
  },
  "environment": {
    "throttle": "none",
    "browser": "chromium",
    "viewport": "1440x900"
  }
}
```

### Comparison Output

```
Performance Comparison: https://example.com
Baseline: 2026-03-20 (5 runs) vs Current: 2026-03-22 (5 runs)

Metric     Baseline p50  Current p50   Δ        Status
─────────  ───────────   ───────────   ──────   ──────
LCP        1200ms        1450ms        +250ms   ⚠ REGRESSION (+20.8%)
CLS        0.05          0.04          -0.01    ✓ improved
FCP        800ms         820ms         +20ms    ✓ within noise
TTFB       150ms         155ms         +5ms     ✓ within noise
DCL        1000ms        1100ms        +100ms   ⚠ REGRESSION (+10.0%)
Load       2000ms        2050ms        +50ms    ✓ within noise

Regression threshold: >10% p50 increase or >20% p95 increase
Result: 2 regressions detected
```

### Implementation

**File:** `src/commands/perf.ts` — extend existing (add ~200 lines)
**File:** `src/perf-stats.ts` — statistics helpers (~150 lines)

1. **Multi-run collection** (`--runs N`):
   - For each run: navigate to URL, wait for load, collect metrics (reuse existing `perf` logic)
   - Between runs: clear cache if `--no-cache`, or reload without cache via `reload --hard`
   - Compute p50, p95, mean, stdev for each metric

2. **`perf baseline`**:
   - Run N iterations
   - Compute stats
   - Write to JSON file
   - Print summary

3. **`perf compare`**:
   - Load baseline file
   - Run N iterations against same URL
   - Compare p50 and p95 for each metric
   - Regression detection:
     - Default threshold: p50 increase >10% or p95 increase >20%
     - Customizable via `--threshold 15`
   - Consider statistical significance: only flag if difference > 2× stdev
   - Exit code: 0 if no regressions, 1 if regressions detected

4. **`perf trend`**:
   - Append current metrics as one JSONL line with timestamp and optional label
   - `--summary`: read file, show metric trends over time (last 10 entries)
   - Useful for tracking performance across deployments

5. **Statistics helpers** (`src/perf-stats.ts`):
   - `percentile(values, p)` — compute nth percentile
   - `mean(values)` — arithmetic mean
   - `stdev(values)` — standard deviation
   - `isRegression(baseline, current, threshold)` — comparison with significance check

### Integration with Flows

```json
{
  "steps": [
    { "goto": "{{base_url}}/" },
    { "perf": { "compare": "perf-baseline.json", "runs": 3 } }
  ]
}
```

### Integration with `throttle`

```bash
# Baseline under 3G conditions
browse throttle 3g
browse perf baseline --url https://example.com --runs 5 --out perf-3g-baseline.json

# Compare under same conditions
browse throttle 3g
browse perf compare --baseline perf-3g-baseline.json --runs 5
```

Environment info (throttle state) is recorded in the baseline for reference.

## Testing

**File:** `test/perf-stats.test.ts`

- Test percentile calculation
- Test mean and stdev
- Test regression detection with known values
- Test within-noise detection (small changes should not flag)

**File:** `test/perf-regression.test.ts`

- Test multi-run collection with mock page
- Test baseline file write/read
- Test comparison output formatting
- Test trend append and summary
- Test exit codes

## Dependencies

- No new dependencies — pure math in `perf-stats.ts`

## Estimated Scope

- `src/perf-stats.ts` — ~150 lines
- Extensions to `src/commands/perf.ts` — ~200 lines
- `test/perf-stats.test.ts` — ~100 lines
- `test/perf-regression.test.ts` — ~150 lines
- Help text updates — ~30 lines
