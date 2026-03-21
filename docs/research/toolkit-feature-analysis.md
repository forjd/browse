# Toolkit Feature Analysis

An analysis of missing features needed to make `browse` a complete browser testing, QA, and scraping toolkit.

## Current State

`browse` ships 60 commands covering navigation, interaction, element inspection, screenshots, visual diffing, assertions (including AI-powered), accessibility audits, flow execution, healthchecks, multi-role test matrices, network mocking, recording/replay, video capture, PDF export, and more. The daemon architecture delivers sub-30 ms warm latency with multi-session and multi-tab support across Chromium, Firefox, and WebKit.

The gaps below represent the categories where coverage is thin or absent entirely.

---

## 1. Performance & Metrics

### Web Vitals Collection

No built-in measurement of Core Web Vitals (LCP, FID/INP, CLS, TTFB). Performance QA is a major testing category and every competing tool supports it.

**Proposed command:**

```
browse perf [--vitals] [--timing] [--budget <path>]
```

- `--vitals` — collect LCP, CLS, INP, TTFB via the PerformanceObserver API
- `--timing` — return Navigation Timing and Resource Timing entries
- `--budget <path>` — fail if metrics exceed thresholds defined in a JSON budget file

### Resource Timing & Transfer Sizes

The `network` command shows requests and status codes but not per-resource load times, transfer sizes, or cache hit rates. Exposing `PerformanceResourceTiming` entries would fill this gap.

### Performance Budgets

Flows and healthchecks have no way to enforce size or timing thresholds. A budget file format would let CI fail when a page regresses:

```json
{
  "lcp": 2500,
  "cls": 0.1,
  "totalTransferSize": 500000
}
```

---

## 2. Network Simulation

### Throttling

`intercept` mocks responses but cannot simulate slow connections. No bandwidth or latency injection exists for testing under 3G, slow 4G, or offline conditions.

**Proposed command:**

```
browse throttle <preset|custom>
browse throttle 3g
browse throttle --latency 200 --download 1500 --upload 750
browse throttle off
```

Playwright exposes CDP's `Network.emulateNetworkConditions`; this is low-effort to implement.

### WebSocket Interception

`intercept` is HTTP-only. There is no way to inspect, mock, or block WebSocket messages — a gap for apps that rely on real-time communication.

### HAR Export

No command to dump a full network session as a HAR file. HAR is the standard interchange format for sharing and analyzing network traces with external tools.

**Proposed command:**

```
browse har start
browse har stop --out <path>
```

---

## 3. Geolocation, Locale & Timezone

### Geolocation Spoofing

No way to override `navigator.geolocation` for testing location-aware apps. Playwright supports this natively via `context.setGeolocation()`.

**Proposed command:**

```
browse geo --lat 37.7749 --lng -122.4194
browse geo off
```

### Timezone Override

No way to set `Intl.DateTimeFormat` resolved timezone. Critical for testing date-sensitive UIs across regions.

**Proposed command:**

```
browse timezone "America/New_York"
browse timezone reset
```

### Locale / Language Override

No `Accept-Language` header or `navigator.language` spoofing. Needed for i18n testing.

**Proposed command:**

```
browse locale "fr-FR"
```

---

## 4. Scraping & Data Extraction

This is the largest categorical gap for scraping use cases.

### Structured Data Extraction

No `extract` command to pull structured data from pages into JSON or CSV. Users must combine `snapshot`, `eval`, and external scripting to scrape content.

**Proposed command:**

```
browse extract --fields '{"title": "h1", "price": ".price", "items": "ul.list > li"}'
browse extract --table "table.data" --format csv
browse extract --schema <path>
```

- `--fields` — map names to CSS selectors, return JSON
- `--table` — extract an HTML table to CSV or JSON
- `--schema` — load field definitions from a file for complex extractions

### Pagination & Crawling

No built-in multi-page crawl with link following, depth limits, or sitemap-aware traversal.

**Proposed command:**

```
browse crawl <url> --depth 3 --follow "a.next-page" --extract <schema> --out results.json
browse crawl <url> --sitemap --extract <schema>
```

### Infinite Scroll Collection

No command to automatically scroll to the bottom of an infinite-scroll page and collect all lazy-loaded content. Currently requires manual `scroll` + `wait` loops.

**Proposed command:**

```
browse scroll-all [--pause 500] [--max-scrolls 50]
```

---

## 5. Advanced Input & Hardware Simulation

### Drag and Drop

No native drag-and-drop command. Sortable lists, kanban boards, and file drop zones cannot be tested.

**Proposed command:**

```
browse drag @ref1 @ref2
browse drag @ref1 --offset 200 100
```

### Multi-Touch & Pinch-Zoom

No touch gesture simulation for mobile-emulated viewports. Tap, swipe, and pinch-zoom are untestable.

### Clipboard Read/Write

No way to test copy/paste workflows. The Clipboard API is increasingly used in modern apps.

**Proposed command:**

```
browse clipboard write "text"
browse clipboard read
```

### Device Orientation

No landscape/portrait toggle or accelerometer/gyroscope data injection for mobile testing.

---

## 6. Authentication & Security

### Cookie Manipulation

`cookies` is read-only. There is no `cookie set` or `cookie delete` command, which is surprising given that `auth-state` exists for import/export.

**Proposed commands:**

```
browse cookie set <name> <value> [--domain <d>] [--path /] [--secure] [--httponly] [--expires <date>]
browse cookie delete <name> [--domain <d>]
browse cookie clear [--domain <d>]
```

### OAuth / SSO Flow Helpers

`login` is form-fill based. No helpers for OAuth redirect chains, SAML flows, or token exchange — common in enterprise apps.

### Security Header Assertions

No assertions on response headers. CSP, HSTS, X-Frame-Options, and other security headers should be checkable.

**Proposed command:**

```
browse assert header "Content-Security-Policy" --contains "default-src 'self'"
browse assert header "Strict-Transport-Security" --exists
```

---

## 7. Testing Framework Integration

### Data-Driven Test Runs

Flows support variables but cannot iterate over a CSV or JSON data source. Running the same flow N times with different inputs requires external scripting.

**Proposed enhancement:**

```
browse flow <name> --data data.csv
browse flow <name> --data '[{"user": "a"}, {"user": "b"}]'
```

### Retry & Flake Management

No built-in retry-on-failure for flaky steps and no flake detection reporting. Flaky tests are the #1 pain point in browser test suites.

**Proposed flags:**

```
browse flow <name> --retries 2 --retry-delay 1000
```

### Test Tagging & Filtering

No way to tag flows and run subsets. Teams need to run `--tag smoke` in CI and `--tag regression` nightly.

**Proposed enhancement:**

```json
{
  "flows": {
    "checkout": {
      "tags": ["smoke", "e2e"],
      "steps": []
    }
  }
}
```

```
browse flow --tag smoke
browse flow --tag regression --parallel
```

### Parallel Flow Execution

`healthcheck` supports `--parallel` but `flow` does not. No way to run multiple independent flows concurrently.

### Before/After Hooks

No setup/teardown steps shared across flows (e.g., seed a database, clear state, log in once). Each flow must be self-contained.

---

## 8. Reporting & Observability

### Trend & History Tracking

Reports are point-in-time snapshots. No run-over-run comparison, trend storage, or regression detection across builds.

### Integrated Screenshot Diffing in Reports

`screenshot --diff` and `report` exist independently but are not connected. Flow and healthcheck reports should embed visual diffs automatically when baselines are configured.

### Code Coverage

No JavaScript code coverage collection (V8/Istanbul) during test runs. Coverage data helps identify untested code paths.

**Proposed command:**

```
browse coverage start
browse coverage stop --out coverage.json
```

### Notification Integrations

`--webhook` provides a generic hook but there are no built-in Slack, Teams, or email formatters for common notification channels.

---

## 9. Advanced Browser Features

### Media Feature Emulation

No way to emulate `prefers-color-scheme`, `prefers-reduced-motion`, or `forced-colors`. Testing dark mode and accessibility preferences requires real OS-level changes.

**Proposed command:**

```
browse emulate color-scheme dark
browse emulate reduced-motion reduce
browse emulate reset
```

Playwright exposes `page.emulateMedia()` — straightforward to implement.

### Permission Granting/Revoking

`assert permission` checks state but cannot *grant* or *revoke* permissions (camera, microphone, notifications, geolocation). Playwright's `context.grantPermissions()` makes this trivial.

**Proposed command:**

```
browse permission grant geolocation camera
browse permission revoke notifications
browse permission reset
```

### Service Worker Inspection

No commands to list, inspect, or unregister service workers. PWA testing requires manual `eval` workarounds.

### IndexedDB & Cache API Inspection

`storage` covers localStorage and sessionStorage only. IndexedDB and the Cache API — both common in modern apps — are invisible.

### CDP Passthrough

Internal CDP usage is not exposed to users. A raw CDP command would serve as a power-user escape hatch for anything not covered by built-in commands.

**Proposed command:**

```
browse cdp <method> [--params '{}']
browse cdp Network.setCacheDisabled --params '{"cacheDisabled": true}'
```

---

## 10. Developer Experience

### Watch Mode

No file-watch mode that re-runs a flow when the config or application source changes. Useful during flow authoring.

**Proposed flag:**

```
browse flow <name> --watch
```

### Interactive / REPL Mode

No persistent interactive session for exploratory testing. Users must invoke individual CLI commands. A REPL would allow faster iteration with tab-completion and history.

### Record-to-Flow Conversion

`trace` records sessions but there is no way to convert a recording into a flow definition. This is the most intuitive way to author new flows.

### Diff-Friendly Snapshot Format

`snapshot` output includes volatile refs (`@e1`, `@e2`) that change between runs, making git-diffing impractical. A stable, content-addressed format would enable snapshot-based regression testing.

---

## Priority Summary

| Priority | Feature | Category | Effort |
|----------|---------|----------|--------|
| **High** | Structured data extraction (`extract`) | Scraping | Medium |
| **High** | Web Vitals / perf metrics (`perf`) | Performance | Medium |
| **High** | Network throttling (`throttle`) | Network | Low |
| **High** | Geolocation & timezone spoofing | Environment | Low |
| **High** | Data-driven test runs | Testing | Medium |
| **High** | Cookie set/delete | Auth | Low |
| **Medium** | HAR export | Network | Low |
| **Medium** | Drag and drop | Input | Low |
| **Medium** | Media feature emulation | Browser | Low |
| **Medium** | Permission grant/revoke | Browser | Low |
| **Medium** | Retry & flake management | Testing | Medium |
| **Medium** | Pagination / crawling | Scraping | High |
| **Medium** | Security header assertions | Auth | Low |
| **Medium** | Test tagging & filtering | Testing | Low |
| **Medium** | Code coverage | Reporting | Medium |
| **Low** | WebSocket interception | Network | High |
| **Low** | CDP passthrough | Browser | Low |
| **Low** | Service worker / IndexedDB inspection | Browser | Medium |
| **Low** | Watch mode | DX | Low |
| **Low** | Record-to-flow conversion | DX | High |
| **Low** | Interactive REPL | DX | Medium |
| **Low** | Trend/history tracking | Reporting | High |

The tool is already remarkably comprehensive. The largest categorical gaps are **scraping/data extraction**, **performance measurement**, and **environment simulation** (geolocation, timezone, network conditions). Filling the high-priority items above would cover essentially every browser testing and scraping scenario.
