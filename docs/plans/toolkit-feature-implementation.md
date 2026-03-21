# Implementation Plan: Developer Toolkit Feature Expansion

**Date:** 2026-03-21
**Based on:** [Gap Analysis](../research/toolkit-gap-analysis.md)

## Scope

Implement four new commands that fill the highest-priority gaps identified in the gap analysis:

1. **`perf`** — Core Web Vitals and page performance metrics via CDP
2. **`security`** — Security headers, cookie flags, and mixed content audit
3. **`responsive`** — Multi-viewport screenshot sweep with comparison
4. **`extract`** — Structured data extraction (tables, selectors, meta tags)

Each command follows the existing pattern: handler in `src/commands/`, registration in `protocol.ts`, dispatch in `daemon.ts`, help in `help.ts`, and tests in `test/`.

---

## Task 1: `perf` Command

**File:** `src/commands/perf.ts`

Collect Core Web Vitals and performance timing via CDP Performance API and page.evaluate().

**Metrics:**
- LCP (Largest Contentful Paint)
- CLS (Cumulative Layout Shift)
- TTFB (Time to First Byte)
- FCP (First Contentful Paint)
- DOM Content Loaded
- Page Load time
- Resource count and total transfer size

**Flags:**
- `--json` — Output as JSON
- `--budget` — Performance budget check (e.g., `--budget lcp=2500,cls=0.1,fcp=1800`)

**Implementation approach:**
- Use `page.evaluate()` to access `performance.getEntriesByType('navigation')`, `performance.getEntriesByType('paint')`, and PerformanceObserver entries for LCP/CLS
- Use CDP `Performance.getMetrics()` for additional metrics on Chromium
- Format as a clean table with pass/fail indicators when `--budget` is used

**Test:** `test/perf.test.ts` — Mock page.evaluate to return fixture timing data, verify formatting and budget pass/fail logic.

---

## Task 2: `security` Command

**File:** `src/commands/security.ts`

Audit security headers, cookie flags, and mixed content.

**Checks:**
- **Headers:** CSP, HSTS (Strict-Transport-Security), X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **Cookies:** Secure, HttpOnly, SameSite flags on each cookie
- **Mixed content:** HTTP resources loaded on HTTPS pages (from network buffer)

**Flags:**
- `--json` — Output as JSON

**Implementation approach:**
- Fetch current page URL via `page.goto()` response or `page.evaluate()` to read `document.location`
- Use `page.evaluate()` + fetch to retrieve response headers for the current page
- Use `context.cookies()` to audit cookie security flags
- Use network buffer to detect mixed content (HTTP URLs on HTTPS page)
- Score each check as pass/warn/fail with recommendations

**Test:** `test/security.test.ts` — Mock page/context with various header and cookie configurations, verify audit output.

---

## Task 3: `responsive` Command

**File:** `src/commands/responsive.ts`

Capture screenshots across multiple viewport breakpoints in a single command.

**Default breakpoints:**
- mobile: 375x667
- tablet: 768x1024
- desktop: 1440x900
- wide: 1920x1080

**Flags:**
- `--breakpoints <spec>` — Custom breakpoints (e.g., `320x568,768x1024,1920x1080`)
- `--url <url>` — URL to test (defaults to current page)
- `--out <dir>` — Output directory
- `--json` — Output as JSON

**Implementation approach:**
- For each breakpoint: set viewport, reload/navigate, capture screenshot
- Restore original viewport when done
- Output summary with paths to each screenshot

**Test:** `test/responsive.test.ts` — Mock page viewport/screenshot, verify breakpoint iteration and output.

---

## Task 4: `extract` Command

**File:** `src/commands/extract.ts`

Structured data extraction from pages.

**Sub-commands:**
- `extract table <selector|@ref>` — Extract HTML table as JSON/CSV
- `extract links [--filter <pattern>]` — Extract all links with href and text
- `extract meta` — Extract meta tags, Open Graph, Twitter Card, JSON-LD
- `extract select <selector> [--attr <name>]` — Extract matching elements' text or attribute

**Flags:**
- `--json` — Output as JSON (default for table/meta)
- `--csv` — Output table as CSV
- `--filter <pattern>` — Filter links by pattern

**Implementation approach:**
- Use `page.evaluate()` to extract DOM data
- For tables: iterate `<tr>` elements, extract `<th>`/`<td>` content
- For links: `document.querySelectorAll('a[href]')`
- For meta: read `<meta>`, `<link>`, and `<script type="application/ld+json">`
- For select: `document.querySelectorAll(selector)` with text/attribute extraction

**Test:** `test/extract.test.ts` — Mock page.evaluate with HTML fixtures, verify extraction output.

---

## Task 5: Integration

For each new command, update these files:

1. **`src/protocol.ts`** — Add command names to `VALID_COMMANDS`
2. **`src/daemon.ts`** — Add import + case in dispatch switch, add to `KNOWN_FLAGS`
3. **`src/help.ts`** — Add command help entries
4. **`src/completions.ts`** — Commands auto-derive from COMMANDS map (no change needed if pattern holds)

---

## Task 6: Lint, Format, and Tests

- Run `bun run check:fix` to fix lint/format issues
- Run `bun test` to verify all tests pass
- Fix any issues that arise

---

## Implementation Order

1. `perf` command (+ test)
2. `security` command (+ test)
3. `responsive` command (+ test)
4. `extract` command (+ test)
5. Wire all four into protocol/daemon/help
6. Run checks and fix issues
