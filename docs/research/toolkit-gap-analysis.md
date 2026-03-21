# Browse Developer Toolkit — Gap Analysis

**Date:** 2026-03-21
**Version analyzed:** 0.10.0

## Executive Summary

Browse is a mature, production-ready browser automation CLI with 54+ commands spanning QA, testing, accessibility, and browser interaction. This analysis identifies gaps across eight capability domains that would elevate Browse from a strong browser automation tool to a comprehensive developer toolkit for QA, testing, scraping, responsiveness, accessibility, performance, and security.

---

## 1. Current Feature Inventory

### What Browse Does Well

| Category | Commands | Maturity |
|----------|----------|----------|
| **Navigation** | goto, back, forward, reload, url, text | Production |
| **Interaction** | click, hover, fill, select, press, scroll, upload, form | Production |
| **Observation** | snapshot, screenshot, console, network, html, attr, title | Production |
| **Accessibility** | a11y (axe-core, WCAG 2.0/2.1/2.2) | Production |
| **Assertions** | assert (8 types), assert-ai (multi-provider) | Production |
| **Visual Testing** | screenshot --diff, diff (multi-page) | Good |
| **Session Mgmt** | session, tab, auth-state, login, cookies, storage | Production |
| **Flow Automation** | flow, healthcheck, test-matrix, flow-share | Production |
| **Media/Debug** | trace, video, pdf, replay, report | Production |
| **Network** | intercept (mock/block), network log capture | Good |
| **Performance** | benchmark (p50/p95/p99 latency) | Basic |

### Architecture Strengths

- **Daemon model** — cold start ~3s, warm calls <30ms
- **Ref system** — accessibility-tree-based element targeting, no brittle selectors
- **Multi-browser** — Chromium, Firefox, WebKit
- **Stealth mode** — patchright + anti-detection patches
- **Pool API** — concurrent multi-agent orchestration
- **CI/CD ready** — JUnit, JSON, Markdown reporters + webhooks

---

## 2. Gap Analysis by Domain

### 2.1 Performance Testing & Monitoring

**Current state:** `benchmark` measures internal command latency (p50/p95/p99). No page-level performance metrics.

**Missing capabilities:**

| Gap | Priority | Description |
|-----|----------|-------------|
| Core Web Vitals collection | **High** | LCP, FID/INP, CLS, TTFB, FCP — the metrics developers actually care about |
| Network throttling | **High** | Simulate 3G/4G/slow connections via CDP Network.emulateNetworkConditions |
| CPU throttling | Medium | Simulate slow devices via CDP Emulation.setCPUThrottlingRate |
| Resource timing breakdown | Medium | Parse/connect/TLS/TTFB/download per resource |
| Performance budget assertions | **High** | `assert performance-budget --lcp 2500 --cls 0.1` |
| Lighthouse/PageSpeed integration | Low | Full audits via lighthouse CLI or API |
| Memory profiling | Low | Heap snapshots, JS memory usage trends |

### 2.2 Responsiveness Testing

**Current state:** `viewport` command sets dimensions, `--device` flag on `goto` sets device presets. No structured responsive testing workflow.

**Missing capabilities:**

| Gap | Priority | Description |
|-----|----------|-------------|
| Multi-viewport screenshot sweep | **High** | Capture screenshots across standard breakpoints in one command |
| Device preset library | Medium | Common devices (iPhone 15, Pixel 8, iPad, etc.) with correct UA/viewport/DPR |
| Responsive diff | **High** | Compare layout across breakpoints, detect overflow/clipping |
| Media query inspector | Low | List active CSS media queries and breakpoints |
| Touch emulation | Low | Verify touch-specific interactions (swipe, pinch) |

### 2.3 Security Testing

**Current state:** No security-focused commands. Network interception exists but is not security-oriented.

**Missing capabilities:**

| Gap | Priority | Description |
|-----|----------|-------------|
| Security headers audit | **High** | Check CSP, HSTS, X-Frame-Options, X-Content-Type, Referrer-Policy, Permissions-Policy |
| Mixed content detection | **High** | Flag HTTP resources loaded on HTTPS pages |
| Cookie security audit | **High** | Check Secure, HttpOnly, SameSite, Path, Domain flags |
| TLS/certificate info | Medium | Certificate validity, protocol version, cipher suite |
| Subresource integrity check | Medium | Verify SRI hashes on external scripts/styles |
| Open redirect detection | Low | Test for URL parameter-based redirects |
| CORS misconfiguration check | Medium | Test Access-Control headers behavior |

### 2.4 Scraping & Data Extraction

**Current state:** `text`, `html`, `attr`, `eval` provide raw extraction. `snapshot` gives accessibility tree. No structured scraping workflow.

**Missing capabilities:**

| Gap | Priority | Description |
|-----|----------|-------------|
| Structured data extraction | **High** | Extract tables, lists, structured content as JSON/CSV |
| CSS selector extraction | **High** | `extract "selector" --attr href --format json` |
| Meta tag extraction | Medium | Open Graph, Twitter Card, JSON-LD, microdata |
| Link extraction & validation | Medium | Crawl links, detect broken links (404s) |
| Pagination automation | Low | Auto-follow next page patterns |
| RSS/sitemap discovery | Low | Find and parse sitemaps and feeds |

### 2.5 Accessibility (Enhancements)

**Current state:** Strong axe-core integration with WCAG standards, severity classification, and JSON output.

**Missing capabilities:**

| Gap | Priority | Description |
|-----|----------|-------------|
| Color contrast checker | Medium | Specific contrast ratio testing beyond axe rules |
| Keyboard navigation audit | **High** | Verify tab order, focus visibility, keyboard traps |
| Screen reader simulation | Low | ARIA live region verification, announcement order |
| Accessibility tree export | Medium | Full tree dump for manual inspection |
| ARIA validation | Medium | Detect invalid ARIA roles, missing labels, orphaned descriptions |

### 2.6 Advanced Assertions & Testing

**Current state:** 8 assertion types + AI assertions. No performance or network assertions.

**Missing capabilities:**

| Gap | Priority | Description |
|-----|----------|-------------|
| Performance assertions | **High** | Assert on LCP, CLS, load time, resource count |
| Network assertions | Medium | Assert on request count, response status, payload size |
| CSS property assertions | Medium | Assert computed styles (color, display, font-size) |
| Console error assertions | Medium | Assert zero console errors (or specific patterns) |
| Accessibility score assertion | Medium | `assert a11y-score --min 90` |

### 2.7 Network Interception (Enhancements)

**Current state:** Add/remove/list/clear with custom status/body/content-type. No latency simulation or header manipulation.

**Missing capabilities:**

| Gap | Priority | Description |
|-----|----------|-------------|
| Response delay injection | **High** | Simulate slow API responses |
| Request/response header modification | Medium | Add/remove/modify headers |
| Request body capture | Medium | Log POST/PUT request bodies |
| Conditional interception | Low | Match on method, headers, body patterns |
| HAR export | Medium | Export captured traffic as HAR file |

### 2.8 Reporting & CI Integration (Enhancements)

**Current state:** JUnit, JSON, Markdown reporters. HTML report generation. Webhook notifications.

**Missing capabilities:**

| Gap | Priority | Description |
|-----|----------|-------------|
| Performance report section | Medium | Include Core Web Vitals in HTML report |
| Security report section | Medium | Include header/cookie audit in HTML report |
| Trend tracking | Low | Compare results across runs over time |
| GitHub Actions annotations | Medium | Output `::warning` / `::error` for CI |
| SARIF output | Low | Standard format for security findings |

---

## 3. Competitive Landscape

| Capability | Browse | Playwright | Cypress | Puppeteer | Lighthouse |
|------------|--------|------------|---------|-----------|------------|
| Browser automation | Yes | Yes | Yes | Yes | No |
| Accessibility audit | Yes | Plugin | Plugin | No | Yes |
| Visual regression | Yes | Plugin | Plugin | No | No |
| Performance metrics | **No** | CDP | No | CDP | Yes |
| Security headers | **No** | No | No | No | Yes |
| Responsive testing | Partial | Viewport | Viewport | Viewport | Yes |
| Network throttling | **No** | Yes | Yes | Yes | Yes |
| AI assertions | Yes | No | No | No | No |
| Scraping/extraction | Basic | Basic | No | Basic | No |
| CLI-first design | Yes | No | No | No | Yes |
| Daemon architecture | Yes | No | No | No | No |

Browse's unique advantages: daemon model, ref system, AI assertions, flow automation, stealth mode, and CLI-first design. The gaps are primarily in **performance monitoring**, **security auditing**, **responsive testing workflows**, and **structured data extraction**.

---

## 4. Prioritized Recommendations

### Tier 1 — High Impact, Moderate Effort

1. **`perf` command** — Core Web Vitals collection via CDP Performance APIs
2. **`security` command** — Security headers + cookie + mixed content audit
3. **`responsive` command** — Multi-viewport screenshot sweep with diff
4. **`extract` command** — Structured data extraction (tables, selectors, meta)
5. **Performance assertions** — `assert perf --lcp 2500 --cls 0.1`
6. **Network throttling** — `--throttle 3g` flag on `goto`

### Tier 2 — Medium Impact, Low-Medium Effort

7. **Cookie security audit** — Extend existing `cookies` command
8. **Keyboard navigation audit** — Extend a11y with focus/tab-order checks
9. **Link validation** — Crawl and check for broken links
10. **HAR export** — Export captured network traffic

### Tier 3 — Nice to Have

11. Lighthouse integration
12. CSS property assertions
13. GitHub Actions annotation output
14. Memory profiling
15. Touch emulation

---

## 5. Conclusion

Browse covers ~75% of what a comprehensive developer toolkit needs. The largest gaps are in **performance monitoring** (no Core Web Vitals), **security auditing** (no header/cookie checks), and **responsive testing** (no multi-breakpoint workflow). These three areas, plus **structured data extraction**, would complete the toolkit and differentiate Browse from competitors that require plugins or separate tools for these capabilities.

The daemon architecture and CDP access make all high-priority gaps achievable without new dependencies — the browser already exposes the APIs needed for performance metrics, network throttling, and security header inspection.
