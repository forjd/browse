# Missing Features Analysis

What browse needs to go from "solid tool" to "indispensable."

---

## Tier 1 — High Impact, Core Gaps

### 1. Visual Regression Testing

Browse can take screenshots but can't compare them. This is the single biggest gap for QA workflows.

**What's needed:**
- `browse diff <baseline> <current>` — pixel-diff two screenshots, output a highlighted diff image and a mismatch percentage
- `browse snapshot-visual [--baseline-dir ./baselines]` — capture and auto-compare against stored baselines
- Configurable threshold (e.g. `--threshold 0.1%` to tolerate anti-aliasing)
- Integration with `healthcheck` — auto-diff screenshots against baselines per page
- JSON output with regions of change for CI gating

**Why it matters:** Without this, every screenshot requires a human to eyeball it. Visual regression is the #1 reason teams adopt browser automation for QA.

---

### 2. Drag and Drop

No way to perform drag-and-drop interactions. This blocks testing of:
- Kanban boards, sortable lists, file upload drop zones
- Slider handles (beyond what `fill` can do)
- Any drag-based UI (drawing tools, reordering, resizing)

**What's needed:**
- `browse drag @e1 @e2` — drag from one element to another
- `browse drag @e1 +200 +0` — drag by offset (for sliders)
- Support for HTML5 drag-and-drop events and pointer-based dragging

---

### 3. Performance Metrics (Core Web Vitals)

Browse can benchmark its own command latency but can't measure the *page's* performance. AI agents doing QA need to flag slow pages.

**What's needed:**
- `browse perf` — report LCP, FID/INP, CLS, TTFB, FCP for the current page
- `browse perf --budget lcp=2500 cls=0.1` — assert against a performance budget
- Integration with `healthcheck` — per-page perf budgets
- Leverage `PerformanceObserver` and Navigation Timing API

---

### 4. HAR Export & Trace Recording

Network inspection exists but there's no way to export a complete session recording for debugging or sharing.

**What's needed:**
- `browse har save <path>` — export all captured network traffic as a HAR file
- `browse trace start` / `browse trace stop <path>` — Playwright trace recording (zip with screenshots, DOM snapshots, network, console)
- Invaluable for debugging failures in CI — attach the trace to a PR comment

---

### 5. Request Mutation (Headers, Auth Tokens)

`intercept` can mock responses but can't modify outgoing requests. This blocks:
- Injecting auth tokens for API testing
- Adding custom headers (feature flags, debug headers, A/B test overrides)
- Modifying cookies on outgoing requests

**What's needed:**
- `browse intercept add <pattern> --set-header "Authorization: Bearer ..."` — add/override request headers
- `browse intercept add <pattern> --set-cookie "debug=1"` — inject cookies per-request
- `browse intercept add <pattern> --delay 2000` — simulate slow responses

---

## Tier 2 — Important Workflow Improvements

### 6. Cookie & Storage Write Operations

Can read cookies and storage but can't write them. Forces workarounds via `eval`.

**What's needed:**
- `browse cookies set <name> <value> [--domain] [--path] [--secure] [--expires]`
- `browse cookies delete <name> [--domain]`
- `browse storage local set <key> <value>`
- `browse storage local delete <key>`
- `browse storage local clear`

---

### 7. Right-Click & Context Menu

No way to trigger context menus or right-click interactions.

**What's needed:**
- `browse click @eN --right` — right-click
- `browse click @eN --double` — double-click
- `browse click @eN --middle` — middle-click (open in new tab)

These are trivial to implement (Playwright supports them) but missing from the CLI surface.

---

### 8. Clipboard Access

No way to read or write the clipboard. Blocks testing of copy/paste flows.

**What's needed:**
- `browse clipboard read` — get clipboard text
- `browse clipboard write "text"` — set clipboard text
- Useful for testing rich text editors, copy-to-clipboard buttons, paste-from-spreadsheet features

---

### 9. WebSocket Inspection

Network monitoring captures HTTP but not WebSocket frames. Blocks QA of:
- Chat applications, real-time dashboards, collaborative editors
- Anything using Socket.IO, GraphQL subscriptions, or raw WebSockets

**What's needed:**
- `browse ws list` — show active WebSocket connections
- `browse ws log [--url pattern]` — capture frames (similar to `console` buffer model)
- `browse ws send <url-pattern> "message"` — inject a frame for testing

---

### 10. Geolocation & Timezone Spoofing

No way to test location-aware features or timezone-sensitive rendering.

**What's needed:**
- `browse geo set <lat> <lon> [--accuracy m]` — spoof geolocation
- `browse timezone set "America/New_York"` — override timezone
- `browse locale set "fr-FR"` — override language/locale
- Useful for testing store locators, delivery estimates, date formatting, i18n

---

### 11. Conditional Logic & Data-Driven Flows

Flows are linear step sequences. No branching, no loops, no data sources.

**What's needed:**
- `if` / `else` steps in flows — branch on assertion results
- `loop` steps — repeat a block with different data
- `data-source` — load test data from CSV/JSON and iterate flows over rows
- `retry` per-step — retry flaky steps N times before failing

This transforms flows from "scripted demos" into a real lightweight test framework.

---

### 12. Structured Test Reporting

Flows and healthchecks print human-readable output. No machine-readable reports for CI.

**What's needed:**
- `browse healthcheck --report junit <path>` — JUnit XML for CI integration
- `browse flow <name> --report json <path>` — structured results
- Summary statistics: pass/fail/skip counts, duration per step
- Screenshot attachment paths in reports

---

## Tier 3 — Nice to Have, Differentiators

### 13. Video Recording

Screenshots capture a moment; video captures the journey.

- `browse record start` / `browse record stop <path>` — record viewport as video (MP4/WebM)
- Playwright supports this natively via `recordVideo`
- Attach to bug reports, PR comments, or test results

### 14. Shadow DOM Support

Refs depend on the accessibility tree which generally handles shadow DOM, but there's no explicit way to pierce shadow roots for `html`, `eval`, or CSS-selector-based commands.

- `browse html ::shadow <selector>` or `browse html <host> --pierce`
- Matters for testing web components (Lit, Stencil, Shoelace, etc.)

### 15. CDP (Chrome DevTools Protocol) Escape Hatch

For power users who need something browse doesn't wrap yet.

- `browse cdp <method> [params-json]` — send a raw CDP command
- Returns the CDP response as JSON
- Escape hatch, not a primary interface — but removes "can't do X" blockers

### 16. Proxy Support

No way to route traffic through an HTTP/SOCKS proxy.

- `browse goto <url> --proxy http://proxy:8080` or daemon-level config
- Matters for: corporate environments, traffic inspection (mitmproxy), geo-testing via proxy

### 17. Multi-Browser Support

Currently Chromium-only. Firefox and WebKit support would catch browser-specific bugs.

- `browse goto <url> --browser firefox`
- Lower priority since Chromium dominates, but important for comprehensive QA

### 18. REPL / Interactive Mode

An interactive shell for exploratory testing.

- `browse repl` — persistent prompt, auto-snapshot after each command, tab completion
- Show element refs inline, history recall
- Significantly lowers the barrier for manual exploration

---

## Priority Recommendation

If I had to pick 5 features to build next, in order:

1. **Visual regression testing** — transforms browse from "automation tool" into "QA tool"
2. **Drag and drop** — small effort, removes a common blocker
3. **Right-click / double-click modifiers** — trivial to add, embarrassing to lack
4. **HAR/trace export** — makes debugging CI failures 10x faster
5. **Performance metrics** — every QA run should surface Core Web Vitals
