# Feature Gap Analysis: 20 User Perspectives

> Generated 2026-03-22 — Analyzing what would make `browse` stand out for different types of users.

## 1. QA Engineer at a Startup

**Gap: Codeless test recorder / visual test builder**

They want to point-and-click in a headed browser and have `browse` record their actions as a `.flow.json` automatically. Currently flows must be hand-written in JSON. A `browse record` command that outputs a flow file would be a killer feature.

## 2. DevOps / Platform Engineer

**Gap: Native CI/CD integration & Docker image**

They want a prebuilt Docker image (`ghcr.io/forjd/browse`) and first-class GitHub Actions / GitLab CI templates. Currently they'd have to wire up `setup.sh`, install deps, and figure out headless config themselves. A `browse ci-init` scaffold or published action would stand out.

## 3. Frontend Developer (React/Vue/Next.js)

**Gap: Dev-server lifecycle management**

They want `browse` to start their dev server, wait for it, run tests, then tear it down — like Playwright's `webServer` config. Currently they have to orchestrate that externally. A `devServer` key in `browse.config.json` would close this gap.

## 4. Accessibility Specialist

**Gap: ARIA role coverage report & remediation suggestions**

The `a11y` command runs axe-core, but doesn't produce a comprehensive coverage report (% of elements with roles, landmark usage, heading hierarchy visualization) or suggest specific code fixes. A richer `a11y report --remediate` output would differentiate it.

## 5. Mobile App Developer (testing PWAs / responsive)

**Gap: Real device emulation profiles & touch gesture simulation**

`responsive` takes breakpoints, but there's no built-in library of real device profiles (iPhone 15 Pro, Pixel 8, etc.) with accurate UA strings, DPR, and touch capabilities. Also missing: pinch-to-zoom, swipe, long-press gesture commands.

## 6. SEO Specialist

**Gap: SEO audit command**

`extract meta` gets Open Graph/Twitter cards, but there's no dedicated `seo` command that checks: canonical URLs, robots directives, structured data validation (Schema.org), heading hierarchy, image alt text coverage, internal link structure, and page speed signals.

## 7. Security Researcher / Pentester

**Gap: Active security scanning (XSS probing, form fuzzing, CSP bypass detection)**

The `security` command is passive (checks headers/cookies). They want `security scan --active` that fuzzes form inputs for reflected XSS, tests for open redirects, checks for clickjacking via actual iframe embedding, and validates CSP effectiveness — not just presence.

## 8. Data Scientist / Scraping Engineer

**Gap: Structured data extraction pipeline with pagination & rate limiting**

`extract table` and `extract links` are one-shot. They want `crawl <url> --depth 2 --extract table --rate-limit 1/s --output data.jsonl` — a crawl/scrape pipeline that follows links, respects robots.txt, handles pagination ("next page" buttons), and outputs structured data.

## 9. Product Manager (non-technical)

**Gap: Natural language command interface**

They can't memorize `snapshot`, `@ref`, `click`. They want: `browse do "go to staging, log in as admin, check the dashboard loads"` — a natural language layer that translates intent into browse commands.

## 10. Performance Engineer

**Gap: Continuous performance monitoring & regression detection**

`perf` gives a one-shot reading. They want `perf watch --baseline perf-baseline.json --runs 5 --alert-on-regression` that runs multiple iterations, computes p50/p95/p99, compares against a saved baseline, and flags regressions with statistical significance.

## 11. Open Source Maintainer (of a component library)

**Gap: Visual regression testing with snapshot management**

`screenshot --diff` does pixel comparison, but there's no `browse vrt update-baselines` / `browse vrt check` workflow that manages a directory of baseline screenshots per component, auto-updates them on approval, and integrates with PR review.

## 12. E2E Test Framework Author

**Gap: Watch mode & interactive REPL**

They want `browse watch` that re-runs a flow on file save, and `browse repl` for interactive exploration with tab-completion, command history, and inline snapshot preview. Currently every command is fire-and-forget from the shell.

## 13. Compliance Officer (GDPR/HIPAA)

**Gap: Cookie consent & privacy compliance audit**

They want `browse compliance --standard gdpr` that checks: cookie banners present, cookies set before consent, third-party tracker detection, data-sharing disclosure validation.

## 14. Internationalization (i18n) Engineer

**Gap: Multi-locale testing automation**

They want to run the same flow across 10 locales and compare: `browse flow checkout --locales en,fr,de,ja,ar --compare`. Should handle RTL layout detection, missing translation detection, date/number format validation, and produce a comparison report.

## 15. API Developer (testing SPAs with API backends)

**Gap: API request/response assertion & contract testing**

`network` shows failed requests, and `intercept` can mock them, but there's no `browse api-assert /api/users --status 200 --schema users.schema.json --timing <500ms` that validates API contracts, response schemas, and timing from the browser's perspective.

## 16. Designer / Design System Lead

**Gap: Design token / computed style extraction & comparison**

They want `browse design-audit --tokens design-tokens.json` that extracts computed styles (colors, fonts, spacing) from the live page, compares them against design tokens, and reports drift.

## 17. Freelance Developer (managing multiple client sites)

**Gap: Multi-site dashboard & scheduled monitoring**

They want `browse monitor --config sites.json --schedule "*/30 * * * *"` — a lightweight uptime/health monitor that runs healthchecks on a cron, stores history, and sends alerts (Slack webhook, email).

## 18. Technical Writer / Documentation Author

**Gap: Automated screenshot capture for docs with annotation**

They want `browse docs-screenshots --flow docs-flow.json --annotate --output docs/images/` that captures screenshots at each step, auto-adds numbered callout annotations (circles, arrows), and generates markdown image references.

## 19. Chaos Engineer / Reliability Tester

**Gap: Network condition simulation & resilience testing**

`intercept` can mock responses, but there's no `browse throttle 3g` or `browse chaos --packet-loss 10% --latency 2000ms` that simulates real network conditions (slow 3G, offline transitions, intermittent failures).

## 20. AI/LLM Application Developer (building agents)

**Gap: Streaming observation protocol & event subscriptions**

The pool library is a start, but they want `browse subscribe --events navigation,console,network` — a persistent event stream (SSE/WebSocket) that their agent can consume in real-time, rather than polling. Also missing: a structured observation format (like OpenTelemetry spans) for agent decision-making.

---

## Summary: Top Feature Gaps by Impact

| Priority | Feature | Personas Served | Effort |
|----------|---------|----------------|--------|
| **High** | `browse record` — interactive test recorder | QA, PM, Freelancer, Tech Writer | Medium |
| **High** | Crawl/scrape pipeline with pagination | Data Scientist, SEO, Freelancer | Medium |
| **High** | Network condition simulation (`throttle`, `chaos`) | Chaos Eng, Perf Eng, Frontend Dev | Low-Med |
| **High** | Natural language command layer (`browse do "..."`) | PM, Tech Writer, Freelancer | Medium |
| **High** | Visual regression testing workflow (`vrt`) | OSS Maintainer, Designer, QA | Medium |
| **Med** | CI/CD templates + Docker image | DevOps, QA, OSS Maintainer | Low |
| **Med** | Watch mode + interactive REPL | Test Author, Frontend Dev, QA | Medium |
| **Med** | SEO audit command | SEO Specialist, Freelancer | Low-Med |
| **Med** | Performance regression detection (multi-run baselines) | Perf Eng, DevOps, Frontend Dev | Medium |
| **Med** | Event subscription / streaming protocol | AI/LLM Dev, DevOps | Medium |
| **Med** | Dev-server lifecycle management | Frontend Dev, QA | Low |
| **Med** | Cookie consent / privacy compliance audit | Compliance, Freelancer | Medium |
| **Low** | Active security scanning | Security Researcher | High |
| **Low** | Multi-locale testing | i18n Engineer | Medium |
| **Low** | API contract testing from browser | API Dev, QA | Medium |
| **Low** | Design token extraction & audit | Designer | Medium |
| **Low** | Automated doc screenshots with annotations | Tech Writer | Low-Med |
| **Low** | Touch gesture simulation | Mobile Dev | Medium |
| **Low** | Scheduled monitoring with alerting | Freelancer, DevOps | Medium |
| **Low** | A11y remediation suggestions | A11y Specialist | Medium |

## Key Insight

The biggest theme: **`browse` excels at one-shot commands for AI agents but lacks workflows** — recording, regression baselines, continuous monitoring, crawling, and streaming. Adding even 3-4 of the "High" items would dramatically widen its appeal beyond the AI-agent niche.
