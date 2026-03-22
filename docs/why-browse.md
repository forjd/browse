# Why Browse?

Browser automation tools aren't new. Playwright, Puppeteer, Cypress, Selenium — they all work. So why does Browse exist, and when should you reach for it?

Browse is a **daemon-based browser CLI** designed for AI agents, CI pipelines, and anyone who wants browser automation without writing browser automation code. It wraps Playwright behind a persistent Unix socket daemon, exposes 50+ commands as plain CLI calls, and targets elements using accessibility-tree refs instead of CSS selectors.

Here's what makes it different, depending on what you care about.

---

## For AI Agent Builders

Traditional browser tools require CSS selectors or XPath — brittle strings that mean nothing to an LLM. Browse introduces **refs**: ephemeral labels (`@e1`, `@e2`, ...) generated from the page's accessibility tree.

```bash
browse snapshot          # → @e1 button "Sign In"  @e2 link "Pricing"  @e3 input "Email"
browse click @e1         # click by ref, not by selector
browse fill @e3 "hi@example.com"
```

The `snapshot` command produces a compact, structured representation of interactive elements — exactly what fits in an LLM context window. The daemon stays warm with **sub-200ms response times**, fast enough for tight agentic loops. And the session pooling API (`createPool`) handles multi-agent orchestration out of the box.

## For DevOps & CI/CD

Browse ships as a **single self-contained binary**. No `npm install`. No `npx playwright install-deps`. No Node.js runtime. Download it, run it.

Every command supports `--json` for machine-parseable output. Healthchecks produce JUnit XML. Performance budgets gate deploys on Core Web Vitals. The daemon runs on a Unix socket — no port conflicts on shared CI runners.

```bash
browse goto https://staging.example.com
browse perf --budget '{"lcp": 2500, "cls": 0.1, "fid": 100}'
browse a11y --standard wcag2aa
browse healthcheck --parallel --reporter junit --out results.xml
```

## For QA Engineers

Write test scenarios **without writing code**. Browse flows are declarative JSON with variables, conditionals, and loops:

```json
{
  "flows": {
    "checkout": {
      "variables": ["base_url", "email"],
      "steps": [
        { "goto": "{{base_url}}/cart" },
        { "fill": { "Email": "{{email}}" } },
        { "click": "Place Order" },
        { "assert": { "textContains": "Order confirmed" } },
        { "screenshot": true }
      ]
    }
  }
}
```

Run it across environments and user roles with `test-matrix`. Share flows across projects with `flow-share`. Get HTML reports with `report --out`.

## For Security Testing

Run authorized security audits from the command line:

```bash
browse security                           # headers, cookies, mixed content
browse console --level error              # client-side errors
browse network --all                      # full request/response log
browse intercept add '**' --status 500    # test error handling
```

Browse's stealth mode (via Patchright) includes anti-detection patches — `navigator.webdriver` spoofing, random user agents, headless detection bypass — for authorized penetration testing against bot-protected targets.

## For Accessibility Specialists

The tool is built on accessibility primitives. The ref system queries the ARIA accessibility tree directly. The `a11y` command runs axe-core audits against WCAG standards. A full accessibility tree dump is one flag away:

```bash
browse snapshot -f     # full accessibility tree
browse a11y --standard wcag2aa
```

This makes Browse one of the few automation tools where accessibility isn't an afterthought — it's the foundation.

## For Frontend & Design Teams

Visual regression testing without a SaaS subscription:

```bash
browse screenshot --out baseline.png
# ... deploy changes ...
browse screenshot --diff baseline.png --threshold 0.95
```

Test across viewports in a single command:

```bash
browse responsive --breakpoints 320x568,768x1024,1440x900,1920x1080
```

Compare staging against production:

```bash
browse diff --baseline https://prod.example.com --current https://staging.example.com
```

## For Performance Engineers

Core Web Vitals and performance budgets as CLI-native concepts:

```bash
browse perf                                              # measure LCP, CLS, FID, TTFB, FCP
browse perf --budget '{"lcp": 2500, "cls": 0.1}'        # fail if budget exceeded
```

Pair with healthchecks to catch performance regressions per deploy. Pipe `--json` output into Grafana, Datadog, or whatever you already use.

## For Everyone Else

Sometimes you just need to automate a browser without ceremony:

```bash
browse goto https://example.com
browse fill @e3 "search term"
browse click @e1
browse screenshot --out result.png
browse text
```

No imports. No test runner. No framework. Just commands.

---

## The Architecture in 30 Seconds

```
CLI (stateless) ──JSON──▶ Unix socket ──▶ Daemon (persistent) ──▶ Playwright ──▶ Chromium
```

The daemon spawns on first command (~3s cold start), keeps the browser warm, and idles out after 30 minutes. Every subsequent command completes in under 200ms. This is fundamentally different from tools that launch and tear down a browser per script execution.

## What Browse Is Not

- **Not a Playwright replacement.** If you need fine-grained programmatic control over browser APIs, write Playwright scripts. Browse exposes `page-eval` for Playwright API access, but its sweet spot is higher-level automation.
- **Not a cloud testing platform.** It runs locally or in your CI runner. No dashboard, no parallelized cloud browsers.
- **Not a web scraping framework.** It can extract data (`extract table`, `extract links`), but purpose-built scrapers will handle pagination, rate limiting, and data pipelines better.

Browse is the fastest path from "I need to interact with a browser" to actually doing it — especially if you're an AI agent, a CI pipeline, or a human who'd rather type commands than write scripts.
