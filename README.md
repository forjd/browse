# browse

[![CI](https://github.com/forjd/browse/actions/workflows/ci.yml/badge.svg)](https://github.com/forjd/browse/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1.svg)](https://bun.sh)
[![Playwright](https://img.shields.io/badge/browser-Playwright-2ead33.svg)](https://playwright.dev)

A fast CLI for browser automation with built-in stealth. Wraps Playwright behind a persistent daemon on a Unix socket — first call cold-starts in ~3s, subsequent calls run in under 30ms (warm daemon).

Built for AI agents doing QA and web scraping, but works just as well by hand.

**[Why Browse?](docs/why-browse.md)** — what makes it different for AI agent builders, DevOps, QA, security, accessibility, and more.

---

## Quick Start

```bash
# Install
brew install forjd/tap/browse
bunx playwright install chrome

# Navigate and screenshot in 2 commands
browse goto https://example.com
browse screenshot

# Or automate with refs
browse snapshot                    # see @e1, @e2, @e3...
browse fill @e1 "hello@example.com"
browse click @e2
```

---

## Table of Contents

- [Install](#install)
- [System Requirements](#system-requirements)
- [Core Concepts](#core-concepts)
  - [How refs work](#how-refs-work)
  - [Navigation](#navigation)
  - [Interaction](#interaction)
  - [Waiting](#waiting-for-conditions)
- [AI Agent Integration](#ai-agent-integration)
- [Common Tasks](#common-tasks)
  - [Screenshots](#screenshots-and-visual-diff)
  - [Accessibility](#accessibility-audit)
  - [Performance](#performance-metrics)
  - [Security](#security-audit)
  - [Data Extraction](#data-extraction)
  - [Responsive Testing](#responsive-testing)
  - [Flows & Assertions](#flows-and-assertions)
- [Advanced](#advanced)
  - [Named Sessions](#named-sessions)
  - [Network Interception](#network-interception)
  - [Multi-browser Support](#multi-browser-support)
  - [Proxy Support](#proxy-support)
- [Plugins](#plugins)
- [Configuration](#configuration)
- [Architecture & Stealth](#architecture--stealth)
- [Performance](#performance)
- [Commands Reference](#commands-reference)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Install

### Homebrew (recommended)

```bash
brew install forjd/tap/browse
bunx playwright install chrome
```

### Manual install

Requires [Bun](https://bun.sh) >= 1.0.

```bash
# Via script
curl -fsSL https://raw.githubusercontent.com/forjd/browse/main/install.sh | bash

# Or manually
git clone https://github.com/forjd/browse.git
cd browse
./setup.sh
```

This compiles a self-contained binary to `dist/browse` and symlinks it to `~/.local/bin/browse`.

### Claude Code skill

If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code), install the skill:

```bash
bunx skills add forjd/browse
```

---

## System Requirements

| Platform | Version | Notes |
|----------|---------|-------|
| macOS | 12+ (Monterey) | Apple Silicon or Intel |
| Linux | glibc 2.31+ | Ubuntu 20.04+, Debian 11+ |
| Windows | Not supported | Use WSL2 |

**Resources:**
- Disk: ~500MB for Chromium
- RAM: ~150MB for daemon, ~300MB per page
- Socket: Unix domain socket at `/tmp/browse-daemon.sock`

---

## Core Concepts

### How refs work

Refs (`@e1`, `@e2`, ...) are how you target elements. Run `browse snapshot` to assign them, then use them with `click`, `fill`, and `select`. Refs go stale after navigation — just snapshot again.

```bash
browse snapshot                     # assigns @e1, @e2, @e3, ...
browse fill @e3 "search term"
browse click @e4
browse snapshot                     # re-assign after the page changes
```

Sample output:
```
[page] "Example Domain"

@e1 [link] "Learn more"
@e2 [button] "Submit"
@e3 [textbox] "Email address"
```

### Navigation

```bash
browse goto https://example.com     # navigate — daemon starts automatically
browse goto https://example.com --preset mobile  # mobile viewport
browse url                          # print the current page URL
browse back                         # navigate back in history
browse forward                      # navigate forward in history
browse reload                       # reload current page
browse reload --hard                # reload bypassing cache
```

### Interaction

```bash
browse click @e1                    # click an element by ref
browse hover @e3                    # hover over an element by ref
browse press Tab                    # send keyboard key press
browse press Shift+Tab              # key combination
browse press Escape                 # close modals/popovers
browse fill @e2 "hello"             # type into an input
browse upload @e5 /path/to/file.pdf  # set file on a file input
browse scroll down                  # scroll down one viewport height
browse scroll @e3                   # scroll element into view
browse scroll 0 500                 # scroll to absolute x,y coordinates
```

### Waiting for conditions

Useful for SPAs where client-side navigation doesn't trigger full page loads:

```bash
browse wait url /dashboard        # wait until URL contains string
browse wait text "Welcome"        # wait until text appears on page
browse wait visible .dashboard    # wait until element is visible
browse wait hidden .spinner       # wait until element disappears
browse wait network-idle          # wait until no pending requests
browse wait 2000                  # simple delay (last resort)
```

All wait subcommands respect `--timeout` and error if the condition isn't met in time.

---

## AI Agent Integration

Browse is designed as a browser backend for AI agents. The CLI interface, JSON responses, persistent daemon, and built-in stealth make it a drop-in browser layer for agent frameworks like [OpenClaw](https://openclaw.ai), [Claude Code](https://docs.anthropic.com/en/docs/claude-code), and custom pipelines.

**Why agents prefer Browse over Playwright/Selenium directly:**

| Feature | Browse | Raw Playwright |
|---------|--------|----------------|
| **Startup time** | ~3s cold, <30ms warm | ~3s every call |
| **CLI interface** | Yes — easy to shell out | No — requires Node.js wrapper |
| **Stealth** | Built-in, passes bot detection | Requires patches/plugins |
| **JSON output** | Native `--json` flag | Manual serialization |
| **Session management** | Named sessions via CLI | Code-only |
| **Resource usage** | Shared daemon | New process per call |

Agents get sub-30ms command latency, named sessions for parallel work, and headless Chrome that passes bot detection — no browser config needed.

---

## Common Tasks

### Screenshots and visual diff

```bash
browse screenshot [path]            # full-page (auto-names if no path given)
browse screenshot --viewport        # viewport only
browse screenshot --diff baseline.png          # compare against baseline
browse screenshot --diff baseline.png --threshold 5  # custom sensitivity
browse screenshots list             # list saved screenshots
browse report --out report.html     # generate HTML report from screenshots
```

The `--diff` flag compares the new screenshot against a baseline image and produces a similarity score, diff pixel count, and a visual diff image highlighting changed regions in red.

### Accessibility audit

```bash
browse a11y                       # full page audit, human-readable output
browse a11y --standard wcag2aa    # WCAG 2.0 AA rules only
browse a11y --standard wcag21aa   # WCAG 2.1 AA rules
browse a11y @e5                   # audit a specific element by ref
browse a11y --json                # machine-readable output for CI
browse a11y --include ".main"     # scope to CSS selector
browse a11y --exclude ".ads"      # exclude regions
```

Output lists violations grouped by severity (critical, serious, moderate, minor) with the failing rule, affected elements, and a link to the fix guidance. Powered by [axe-core](https://github.com/dequelabs/axe-core).

### Performance metrics

```bash
browse perf                                  # Core Web Vitals + timing metrics
browse perf --json                           # machine-readable output
browse perf --budget lcp=2500,cls=0.1,fcp=1800  # performance budget check
```

Output includes TTFB, FCP, LCP, CLS, DOM Content Loaded, Page Load, resource count, and transfer size. The `--budget` flag checks each metric against a threshold and reports pass/fail.

### Security audit

```bash
browse security                              # full security audit
browse security --json                       # machine-readable output
```

Audits the current page for:
- **Security headers:** HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **Cookie security:** Secure, HttpOnly, SameSite flags
- **Mixed content:** HTTP resources loaded on HTTPS pages

### Data extraction

```bash
browse extract table "table.results"         # extract HTML table as text
browse extract table "table.data" --json     # extract as JSON objects
browse extract table "table.data" --csv      # extract as CSV
browse extract links                         # extract all links
browse extract links --filter "example"      # filter links by pattern
browse extract meta                          # meta tags, Open Graph, JSON-LD
browse extract meta --json                   # machine-readable metadata
browse extract select "h2"                   # extract text of matching elements
browse extract select "a.nav" --attr href  # extract attribute values
```

### Responsive testing

```bash
browse viewport                              # show current viewport size
browse viewport 320 568                      # set exact width x height
browse viewport 320x568                      # alternative format
browse viewport --device "iPhone SE"         # use a Playwright device profile
browse viewport --preset mobile              # 375x667
browse viewport --preset tablet              # 768x1024
browse viewport --preset desktop             # 1440x900
browse responsive                            # screenshot at all default breakpoints
browse responsive --breakpoints 320x568,768x1024,1920x1080  # custom breakpoints
```

### Flows and assertions

Define reusable flows in `browse.config.json` or as individual JSON files in a `flows/` directory, then run them:

```bash
browse flow list
browse flow signup --var base_url=https://staging.example.com
browse flow signup --reporter junit          # JUnit XML output for CI
browse flow signup --reporter json           # structured JSON output
browse flow signup --dry-run                 # preview steps without running
browse assert text-contains "Welcome"
browse assert visible ".dashboard"
browse healthcheck --var base_url=https://staging.example.com
```

---

## Advanced

### Named sessions

Run multiple named sessions within a shared Chromium process:

```bash
browse session create worker-1              # create a session (shared context)
browse session create worker-2 --isolated   # create with isolated browser context
browse --session worker-1 goto https://a.com  # route commands to a session
browse --session worker-2 goto https://b.com
browse session list                         # list all sessions
browse session close worker-1               # close a session
```

By default, sessions share the browser context (cookies, storage). Use `--isolated` to create a fully separate browser context with its own cookies, storage, and permissions.

**Pool (library) for multi-agent orchestration:**

```typescript
import { createPool } from "browse/pool";

const pool = createPool({ socketPath: "/tmp/browse-daemon.sock", maxSessions: 10 });
const session = await pool.acquire();
await session.exec("goto", "https://example.com");
session.release();
await pool.destroy();
```

### Network interception

```bash
browse intercept add "**/api/users" --body '{"users":[]}'   # mock API response
browse intercept add "**/analytics/**" --status 204          # block with status
browse intercept list                                        # list active rules
browse intercept remove "**/api/users"                       # remove a rule
browse intercept clear                                       # remove all rules
```

### Multi-browser support

Browse defaults to Chromium but also supports Firefox and WebKit for cross-browser testing:

```bash
browse --browser firefox goto https://example.com
browse --browser webkit goto https://example.com
```

Or via environment variable (must be set before the daemon starts):

```bash
BROWSE_BROWSER=firefox browse goto https://example.com
```

> **Note:** Stealth features are Chromium-specific and are not applied to Firefox or WebKit.

To install additional browsers, set `BROWSE_BROWSERS` before running setup:

```bash
BROWSE_BROWSERS="firefox webkit" ./setup.sh
```

### Proxy support

Route all browser traffic through an HTTP or SOCKS proxy:

```bash
browse --proxy http://proxy:8080 goto https://example.com
browse --proxy socks5://proxy:1080 goto https://example.com
```

Or via environment variable:

```bash
BROWSE_PROXY=http://proxy:8080 browse goto https://example.com
```

Or in `browse.config.json` (supports authentication and bypass lists):

```json
{
  "proxy": {
    "server": "http://proxy:8080",
    "bypass": "localhost,*.internal.com",
    "username": "user",
    "password": "pass"
  }
}
```

> **Note:** The daemon must be restarted for proxy changes to take effect. Run `browse quit` first.

### Headed mode

Launch the browser visibly for debugging:

```bash
BROWSE_HEADED=1 browse goto https://example.com
```

> **Note:** Environment variable must be set before the daemon starts. If already running, run `browse quit` first.

---

## Plugins

Extend browse with custom commands and lifecycle hooks. Plugins are TypeScript or JavaScript files that export a `BrowsePlugin` object.

```typescript
// plugins/hello.ts
import type { BrowsePlugin } from "browse/plugin";

const plugin: BrowsePlugin = {
  name: "hello",
  version: "1.0.0",
  commands: [{
    name: "hello",
    summary: "Say hello",
    usage: "browse hello [name]",
    handler: async (ctx) => ({
      ok: true,
      data: `Hello, ${ctx.args[0] ?? "world"}!`,
    }),
  }],
};

export default plugin;
```

Register in `browse.config.json`:

```json
{
  "plugins": ["./plugins/hello.ts"]
}
```

Plugins can also hook into the command lifecycle (`beforeCommand`, `afterCommand`, `cleanup`) and maintain per-session state. Place personal plugins in `~/.browse/plugins/` for auto-discovery across all projects.

See the **[plugin authoring guide](docs/plugins.md)** for full documentation.

---

## Configuration

Optional. Create `browse.config.json` in your project root to configure login environments, reusable flows, permission checks, and health checks.

```json
{
  "environments": {
    "staging": {
      "loginUrl": "https://staging.example.com/login",
      "userEnvVar": "STAGING_USER",
      "passEnvVar": "STAGING_PASS",
      "usernameField": "Email",
      "passwordField": "Password",
      "submitButton": "Sign in",
      "successCondition": { "urlContains": "/dashboard" }
    }
  },
  "flows": {
    "signup": {
      "description": "Test the signup flow",
      "variables": ["base_url", "test_email"],
      "steps": [
        { "goto": "{{base_url}}/register" },
        { "fill": { "input[name=email]": "{{test_email}}" } },
        { "click": "button[type=submit]" },
        { "wait": { "urlContains": "/welcome" } },
        { "assert": { "textContains": "Welcome" } }
      ]
    }
  },
  "timeout": 45000
}
```

See [configuration docs](docs/configuration.md) for full options including Playwright passthrough.

---

## Architecture & Stealth

**Architecture:**

```
CLI ──JSON──▶ Unix socket ──▶ Daemon ──▶ Playwright ──▶ Chromium (default)
              TCP socket ──┘                          ├─▶ Firefox
                                                      └─▶ WebKit
```

The daemon spawns on first use and stays alive for 30 minutes of inactivity. It owns a single browser instance and communicates over a Unix socket. The CLI is a thin client that serialises commands as JSON. Named sessions allow multiple page groups to share one browser process.

The daemon socket is secured with a shared-secret authentication token stored at `$XDG_STATE_HOME/browse/daemon.token`. SIGTERM and SIGINT are trapped for graceful shutdown.

For remote agent access, the daemon can also listen on a TCP port via `--listen <host>:<port>`.

**Stealth:**

Browse ships with built-in anti-detection for headless Chrome — no plugins or extra config needed:

- **Navigator patching** — clean user-agent string, consistent `userAgentData` brands/platform via CDP metadata
- **Screen spoofing** — plausible monitor resolution and taskbar offset to avoid viewport-equals-screen detection
- **Chrome stubs** — `chrome.app` and `chrome.runtime` stubs matching real Chrome
- **Worker coverage** — user-agent and fingerprint patches in SharedWorker and ServiceWorker contexts
- **Iframe protection** — randomised mouse event coordinates to prevent CDP coordinate leaks (Cloudflare Turnstile)

Passes Sannysoft, Intoli, Pixelscan, and BrowserLeaks. Partially evades CreepJS.

---

## Performance

Measured with `browse benchmark`:

| Command    | p50  | p95  |
|------------|------|------|
| goto       | 27ms | 32ms |
| snapshot   | 1ms  | 11ms |
| screenshot | 24ms | 25ms |
| click      | 17ms | 18ms |
| fill       | 1ms  | 26ms |

Target: p95 < 200ms for non-screenshot commands.

---

## Commands Reference

Browse has 90+ commands. Here are the most commonly used:

| Command | Description |
|---------|-------------|
| `goto <url>` | Navigate to URL |
| `url` | Print current page URL |
| `snapshot` | List elements with refs (@e1, @e2...) |
| `click @eN` | Click element by ref |
| `fill @eN "value"` | Fill input (clears first) |
| `screenshot [path]` | Capture page |
| `a11y` | Accessibility audit |
| `perf` | Core Web Vitals |
| `security` | Security audit |
| `flow <name>` | Run configured flow |
| `session create <name>` | Create named session |
| `status` | Daemon status |
| `quit` | Stop the daemon |

**See the [full commands list](docs/commands.md)** for complete documentation including:
- DOM inspection (`html`, `title`, `attr`, `element-count`)
- Data extraction (`extract table\|links\|meta\|select`)
- Debugging (`console`, `network`, `trace`, `video`)
- Dialog handling (`dialog accept\|dismiss`)
- Iframes (`frame list\|switch`)
- Auth (`login`, `auth-state`)
- Visual regression (`vrt`, `diff`)
- CI/CD (`ci-init`, `test-matrix`)
- And more...

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Changes not applying** | Run `browse quit` to restart the daemon after binary rebuilds |
| **Proxy not working** | Daemon must be restarted for proxy changes: `browse quit` then retry |
| **macOS "cannot verify developer"** | Run `xattr -d com.apple.quarantine ~/.local/bin/browse` |
| **Stealth not working** | Ensure you're using Chromium (default). Stealth doesn't apply to Firefox/WebKit |
| **Refs stale** | Run `browse snapshot` again after navigation — refs are page-specific |
| **Session/auth issues** | Run `browse wipe` to clear all cookies and storage |
| **Port already in use** | Check for zombie daemon: `lsof -i :<port>` or `browse quit` |

---

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 [Forjd.dev](https://forjd.dev)

---

**Questions or issues?** [Open an issue](https://github.com/forjd/browse/issues) or [start a discussion](https://github.com/forjd/browse/discussions).
