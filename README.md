# browse

[![CI](https://github.com/forjd/browse/actions/workflows/ci.yml/badge.svg)](https://github.com/forjd/browse/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1.svg)](https://bun.sh)
[![Playwright](https://img.shields.io/badge/browser-Playwright-2ead33.svg)](https://playwright.dev)

A fast CLI for browser automation. Wraps Playwright behind a persistent daemon on a Unix socket — first call cold-starts in ~3s, every call after that runs in under 30ms.

Built for AI agents doing QA, but works just as well by hand.

**[Why Browse?](docs/why-browse.md)** — what makes it different for AI agent builders, DevOps, QA, security, accessibility, and more.

## Install

Requires [Bun](https://bun.sh) >= 1.0.

```sh
curl -fsSL https://raw.githubusercontent.com/forjd/browse/main/install.sh | bash
```

Or manually:

```sh
git clone https://github.com/forjd/browse.git
cd browse
./setup.sh
```

This installs dependencies, downloads Chromium, compiles a self-contained binary to `dist/browse`, and symlinks it to `~/.local/bin/browse`.

### Claude Code skill

If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code), install the skill so Claude can drive the browser for you:

```sh
bunx skills add forjd/browse
```

## Usage

```sh
browse goto https://example.com     # navigate — daemon starts automatically
browse goto https://example.com --preset mobile  # navigate at mobile viewport
browse url                          # print the current page URL
browse back                         # navigate back in history
browse forward                      # navigate forward in history
browse reload                       # reload current page
browse reload --hard                # reload bypassing cache
browse snapshot                     # list interactive elements with refs
browse click @e1                    # click an element by ref
browse attr @e1 href                # read an element's attribute
browse hover @e3                    # hover over an element by ref
browse press Tab                    # send a keyboard key press
browse fill @e2 "hello"             # type into an input
browse upload @e5 /path/to/file.pdf  # set file on a file input
browse scroll down                  # scroll down one viewport height
browse scroll @e3                   # scroll element into view
browse screenshot                   # capture the page
browse trace start                  # start recording a Playwright trace
browse trace stop --out trace.zip   # stop and save the trace
browse trace view --latest          # open most recent trace in viewer
browse video start                  # start recording a session video
browse video stop --out demo.webm   # stop and save the video
browse init                         # generate a browse.config.json template
browse screenshots list             # list saved screenshots
browse report --out report.html     # generate an HTML report from screenshots
browse form --data '{"name":"Jo"}'  # bulk-fill form fields
browse replay --out replay.html     # generate session replay timeline
browse completions bash             # output shell completions
browse version                       # print version and platform
browse quit                         # shut down the daemon
```

### How refs work

Refs (`@e1`, `@e2`, ...) are how you target elements. Run `browse snapshot` to assign them, then use them with `click`, `fill`, and `select`. Refs go stale after navigation — just snapshot again.

```sh
browse snapshot                     # assigns @e1, @e2, @e3, ...
browse fill @e3 "search term"
browse click @e4
browse snapshot                     # re-assign after the page changes
```

### Scrolling

```sh
browse scroll down               # scroll down one viewport height
browse scroll up                 # scroll up one viewport height
browse scroll top                # scroll to top of page
browse scroll bottom             # scroll to bottom of page
browse scroll @e5                # scroll element into view
browse scroll 0 500              # scroll to absolute x,y coordinates
```

### Keyboard

```sh
browse press Tab                 # single key
browse press Tab Tab Tab         # multiple sequential keys
browse press Shift+Tab           # key combination
browse press Escape              # close modals/popovers
browse press Enter               # submit/activate
browse press ArrowDown           # navigate within menus
browse press Control+a           # select all
```

### Waiting for conditions

Useful for SPAs where client-side navigation doesn't trigger full page loads:

```sh
browse wait url /dashboard        # wait until URL contains string
browse wait text "Welcome"        # wait until text appears on page
browse wait visible .dashboard    # wait until element is visible
browse wait hidden .spinner       # wait until element disappears
browse wait network-idle          # wait until no pending requests
browse wait 2000                  # simple delay (last resort)
```

All wait subcommands respect `--timeout` and error if the condition isn't met in time.

### Screenshots and visual diff

```sh
browse screenshot [path]            # full-page (auto-names if no path given)
browse screenshot --viewport        # viewport only
browse screenshot --diff baseline.png          # compare against baseline
browse screenshot --diff baseline.png --threshold 5  # custom sensitivity
browse console                      # console messages since last call
browse console --level error        # filter by level
browse network                      # failed requests (4xx/5xx)
browse network --all                # all requests
```

The `--diff` flag compares the new screenshot against a baseline image and produces a similarity score, diff pixel count, and a visual diff image highlighting changed regions in red.

### Accessibility audit

```sh
browse a11y                       # full page audit, human-readable output
browse a11y --standard wcag2aa    # WCAG 2.0 AA rules only
browse a11y --standard wcag21aa   # WCAG 2.1 AA rules
browse a11y @e5                   # audit a specific element by ref
browse a11y --json                # machine-readable output for CI
browse a11y --include ".main"     # scope to CSS selector
browse a11y --exclude ".ads"      # exclude regions
```

Output lists violations grouped by severity (critical, serious, moderate, minor) with the failing rule, affected elements, and a link to the fix guidance. Powered by [axe-core](https://github.com/dequelabs/axe-core).

### Responsive testing

```sh
browse viewport                              # show current viewport size
browse viewport 320 568                      # set exact width x height
browse viewport 320x568                      # alternative format
browse viewport --device "iPhone SE"         # use a Playwright device profile
browse viewport --preset mobile              # 375x667
browse viewport --preset tablet              # 768x1024
browse viewport --preset desktop             # 1440x900
browse goto https://example.com --viewport 320x568   # navigate at a specific size
browse goto https://example.com --device "iPhone SE"  # navigate with device profile
browse responsive                            # screenshot at all default breakpoints
browse responsive --breakpoints 320x568,768x1024,1920x1080  # custom breakpoints
browse responsive --url https://example.com --out ./screenshots  # specific URL
```

### Tabs

```sh
browse tab list
browse tab new https://other.com
browse tab switch 2
browse tab close
```

### Named sessions

Run multiple named sessions within a shared Chromium process:

```sh
browse session create worker-1              # create a session (shared context)
browse session create worker-2 --isolated   # create with isolated browser context
browse --session worker-1 goto https://a.com  # route commands to a session
browse --session worker-2 goto https://b.com
browse session list                         # list all sessions
browse session close worker-1               # close a session
```

By default, sessions share the browser context (cookies, storage). Use `--isolated` to
create a fully separate browser context with its own cookies, storage, and permissions.

### Pool (library)

For multi-agent orchestration, use the pool manager to acquire/release sessions programmatically:

```typescript
import { createPool } from "browse/pool";

const pool = createPool({ socketPath: "/tmp/browse-daemon.sock", maxSessions: 10 });
const session = await pool.acquire();
await session.exec("goto", "https://example.com");
session.release();
await pool.destroy();
```

### Auth and sessions

```sh
browse login --env staging                  # configured login via browse.config.json
browse auth-state save /tmp/session.json    # export cookies + localStorage
browse auth-state load /tmp/session.json    # restore a saved session
browse wipe                                 # clear all session data
```

### JavaScript evaluation

```sh
browse eval "document.title"                                   # run JS in the page context
browse eval "getComputedStyle(document.body).backgroundColor"  # inspect computed styles
browse eval "document.querySelectorAll('a').length"            # count elements
browse page-eval "await page.title()"                          # run Playwright page-level code
browse page-eval "page.viewportSize()"                         # access page API directly
```

### Dialogs

```sh
browse dialog status                        # check for pending dialog
browse dialog accept                        # accept (OK) a pending dialog
browse dialog accept "some text"            # accept with input text (prompt dialogs)
browse dialog dismiss                       # dismiss (Cancel) a pending dialog
browse dialog auto-accept                   # automatically accept all future dialogs
browse dialog auto-dismiss                  # automatically dismiss all future dialogs
browse dialog auto-off                      # disable auto-mode, queue dialogs
```

### Downloads

```sh
browse download wait                        # wait for next download
browse download wait --save-to ./file.pdf   # save to specific path
browse download wait --timeout 60000        # custom timeout
browse download wait --expect-type application/pdf  # verify MIME type
browse download wait --expect-min-size 1024         # verify minimum size
```

### Iframes

```sh
browse frame list                           # list all frames
browse frame switch 0                       # switch to frame by index
browse frame switch "my-frame"              # switch by name
browse frame switch "example.com"           # switch by URL substring
browse frame main                           # show main frame info
```

### Network interception

```sh
browse intercept add "**/api/users" --body '{"users":[]}'   # mock API response
browse intercept add "**/analytics/**" --status 204          # block with status
browse intercept list                                        # list active rules
browse intercept remove "**/api/users"                       # remove a rule
browse intercept clear                                       # remove all rules
```

### Performance metrics

```sh
browse perf                                  # Core Web Vitals + timing metrics
browse perf --json                           # machine-readable output
browse perf --budget lcp=2500,cls=0.1,fcp=1800  # performance budget check
```

Output includes TTFB, FCP, LCP, CLS, DOM Content Loaded, Page Load, resource count, and transfer size. The `--budget` flag checks each metric against a threshold and reports pass/fail.

### Security audit

```sh
browse security                              # full security audit
browse security --json                       # machine-readable output
```

Audits the current page for:
- **Security headers:** HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **Cookie security:** Secure, HttpOnly, SameSite flags
- **Mixed content:** HTTP resources loaded on HTTPS pages

### Data extraction

```sh
browse extract table "table.results"         # extract HTML table as text
browse extract table "table.data" --json     # extract as JSON objects
browse extract table "table.data" --csv      # extract as CSV
browse extract links                         # extract all links
browse extract links --filter "example"      # filter links by pattern
browse extract meta                          # meta tags, Open Graph, JSON-LD
browse extract meta --json                   # machine-readable metadata
browse extract select "h2"                   # extract text of matching elements
browse extract select "a.nav" --attr href    # extract attribute values
```

### DOM inspection

```sh
browse html                                 # full page HTML
browse html @e3                             # element's outerHTML
browse html ".sidebar"                      # element by CSS selector
browse title                                # page title
browse element-count ".item"                # count matching elements
browse cookies                              # list all cookies
browse cookies --domain example.com         # filter by domain
browse storage local                        # show localStorage
browse storage session                      # show sessionStorage
browse pdf                                  # export page as PDF
browse pdf ./report.pdf                     # export to specific path
```

### Daemon health

```sh
browse ping                                 # check if daemon is alive
browse status                               # show URL, sessions, uptime
browse status --json                        # machine-readable daemon status
browse status --watch                       # live-updating status (every 5s)
browse status --watch --interval 10         # poll every 10 seconds
browse status --watch --json                # NDJSON stream for monitoring
browse status --exit-code                   # exit 0/1 for CI health probes
```

### Flows and assertions

Define reusable flows in `browse.config.json`, then run them:

```sh
browse flow list
browse flow signup --var base_url=https://staging.example.com
browse flow signup --reporter junit                    # JUnit XML output for CI
browse flow signup --reporter json                    # structured JSON output
browse flow signup --reporter markdown                # human-readable Markdown
browse flow signup --dry-run                           # preview steps without running
browse flow signup --stream                            # real-time NDJSON step output
browse assert text-contains "Welcome"
browse assert visible ".dashboard"
browse healthcheck --var base_url=https://staging.example.com
browse healthcheck --reporter junit                    # JUnit XML output for CI
browse healthcheck --reporter json                    # structured JSON output
browse healthcheck --reporter markdown                # human-readable Markdown
browse healthcheck --parallel --concurrency 4          # check pages in parallel
```

### Timeouts

Any command accepts `--timeout <ms>` (default: 30s):

```sh
browse goto https://slow-page.com --timeout 60000
```

Unrecognised flags on any command produce an error with a hint to check `browse help <command>`.

### Multi-browser support

Browse defaults to Chromium but also supports Firefox and WebKit for cross-browser testing. Set the browser via a CLI flag, environment variable, or config file:

```sh
browse --browser firefox goto https://example.com
browse --browser webkit goto https://example.com
browse --browser chrome goto https://example.com   # default
```

Or via environment variable (must be set before the daemon starts):

```sh
BROWSE_BROWSER=firefox browse goto https://example.com
```

Or in `browse.config.json`:

```json
{
  "browser": "firefox",
  "environments": { ... }
}
```

The `status` command reports which browser is running:

```sh
browse status
# Browser: Firefox 134.0
```

> **Note:** Chromium stealth features (fingerprint spoofing, anti-detection patches) are Chromium-specific and are not applied to Firefox or WebKit. CDP-based console capture also falls back to Playwright's built-in listener for non-Chromium browsers.

To install additional browsers, set `BROWSE_BROWSERS` before running setup:

```sh
BROWSE_BROWSERS="firefox webkit" ./setup.sh
```

### Proxy support

Route all browser traffic through an HTTP or SOCKS proxy. Set via a CLI flag, environment variable, or config file:

```sh
browse --proxy http://proxy:8080 goto https://example.com
browse --proxy socks5://proxy:1080 goto https://example.com
```

Or via environment variable (must be set before the daemon starts):

```sh
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
  },
  "environments": { ... }
}
```

Precedence: `--proxy` flag > `BROWSE_PROXY` env var > config file. The proxy applies to all browser contexts including isolated sessions, test-matrix, and video recording.

> **Note:** The daemon must be restarted for proxy changes to take effect. Run `browse quit` first if a daemon is already running.

### Headed mode

Launch the browser visibly for debugging. The environment variable must be set before the daemon starts (i.e., before the first `browse` command). If a daemon is already running, run `browse quit` first so it restarts in headed mode:

```sh
BROWSE_HEADED=1 browse goto https://example.com
```

## Configuration

Optional. Create `browse.config.json` in your project root to configure login environments, reusable flows, permission checks, and health checks. The config file is resolved in order: `--config <path>` flag, upward directory search from cwd, then `~/.browse/config.json` as a global fallback.

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
  "healthcheck": {
    "pages": [
      { "url": "{{base_url}}/dashboard", "screenshot": true, "console": "error" },
      { "url": "{{base_url}}/settings", "assertions": [{ "visible": ".settings-form" }] }
    ]
  },
  "playwright": {
    "launchOptions": {
      "locale": "en-GB",
      "timezoneId": "Europe/London"
    },
    "contextOptions": {
      "colorScheme": "dark"
    }
  },
  "timeout": 45000
}
```

### Playwright passthrough

Pass any Playwright launch or context option directly via the `playwright` key in `browse.config.json`. Options are spread into the underlying Playwright calls — browse's own options (headless, viewport, stealth) take precedence on conflict. See the [configuration docs](docs/configuration.md#playwright-passthrough-optional) for details.

## Architecture

The daemon spawns on first use and stays alive for 30 minutes of inactivity. It owns a single Chromium instance and communicates over a Unix socket at `/tmp/browse-daemon.sock`. The CLI is a thin client that serialises commands as JSON and prints responses. Named sessions allow multiple page groups to share one Chromium process. By default sessions share the browser context; pass `--isolated` to `session create` for a fully separate context with its own cookies, storage, and permissions.

The daemon socket is secured with a shared-secret authentication token generated at startup and stored at `$XDG_STATE_HOME/browse/daemon.token` (or `~/.local/state/browse/daemon.token` when `$XDG_STATE_HOME` is unset), owner-readable only. The CLI reads this token and sends it with every request. SIGTERM and SIGINT are trapped for graceful shutdown — PID files, socket files, and token files are cleaned up automatically.

For remote agent access, the daemon can also listen on a TCP port via `--listen <host>:<port>`. Crash recovery uses exponential backoff (3 retries at 1s/2s/4s delays) with a circuit breaker that trips after 3 consecutive failures.

> **Note:** Rebuilding the binary does not restart a running daemon. If you rebuild after adding or changing commands, run `browse quit` first so the next call cold-starts with the new binary.

```
CLI ──JSON──▶ Unix socket ──▶ Daemon ──▶ Playwright ──▶ Chromium (default)
              TCP socket ──┘                          ├─▶ Firefox
                                                      └─▶ WebKit
```

## Performance

Measured with `browse benchmark`:

| Command    | p50  | p95  |
|------------|------|------|
| goto       | 27ms | 32ms |
| snapshot   | 1ms  | 11ms |
| screenshot | 24ms | 25ms |
| click      | 17ms | 18ms |
| fill       | 1ms  | 26ms |

## All commands

| Command | Description |
|---------|-------------|
| `goto <url>` | Navigate to URL (`--viewport`, `--device`, `--preset`) |
| `url` | Print current page URL |
| `back` | Navigate back in history |
| `forward` | Navigate forward in history |
| `reload` | Reload current page (`--hard` to bypass cache) |
| `text` | Return visible page text |
| `snapshot` | List elements with refs (`-i` structural, `-f` full tree) |
| `click @eN` | Click element |
| `hover @eN` | Hover over element (`--duration <ms>`) |
| `fill @eN "value"` | Fill input (clears first) |
| `attr @eN [attribute]` | Read element attributes (single or all) |
| `select @eN "option"` | Select dropdown option |
| `upload @eN <file> [file ...]` | Set file(s) on a file input |
| `press <key> [key ...]` | Send keyboard key presses (`Shift+Tab`, `Escape`, etc.) |
| `wait <type> <args>` | Wait for condition (`url`, `text`, `visible`, `hidden`, `network-idle`, `<ms>`) |
| `scroll <direction\|@ref\|x y>` | Scroll page or element into view |
| `screenshot [path]` | Capture page (`--viewport`, `--selector`, `--diff`, `--threshold`) |
| `console` | Console log (`--level`, `--keep`) |
| `network` | Failed requests (`--all`, `--keep`) |
| `eval <expression>` | Run JavaScript in page context |
| `page-eval <expression>` | Run Playwright page-level operations |
| `viewport [W H\|WxH]` | Get or set viewport (`--device`, `--preset`) |
| `tab list\|new\|switch\|close` | Tab management |
| `login --env <name>` | Configured login |
| `auth-state save\|load <path>` | Session import/export |
| `flow list\|<name>` | Run configured flows (`--reporter junit\|json\|markdown`, `--dry-run`, `--stream`) |
| `assert <type> <args>` | Assertions (visible, text, url, element, permission) |
| `healthcheck` | Multi-page health check (`--reporter junit\|json\|markdown`, `--parallel`, `--concurrency`) |
| `a11y [@eN]` | Accessibility audit (`--standard`, `--json`, `--include`, `--exclude`) |
| `session create\|list\|close` | Manage isolated browser sessions |
| `ping` | Check if daemon is alive |
| `status` | Show daemon status and uptime (`--json`, `--watch`, `--exit-code`) |
| `dialog accept\|dismiss\|status\|auto-*` | Handle browser dialogs |
| `download wait` | Wait for and save file downloads (`--save-to`, `--expect-type`, `--expect-min-size`, `--expect-max-size`) |
| `frame list\|switch\|main` | Navigate and inspect iframes |
| `intercept add\|remove\|list\|clear` | Mock or block network requests |
| `cookies` | Inspect browser cookies (`--domain`) |
| `storage local\|session` | Inspect localStorage or sessionStorage |
| `html [selector\|@eN]` | Get page or element HTML |
| `title` | Get the page title |
| `pdf [path]` | Export page as PDF |
| `element-count <selector>` | Count elements matching a selector |
| `wipe` | Clear all session data |
| `benchmark` | Measure latency |
| `trace start\|stop\|view\|list\|status` | Record and view Playwright traces (`--screenshots`, `--snapshots`, `--out`, `--latest`, `--port`) |
| `report --out <path>` | Generate HTML report from screenshots (`--title`, `--screenshots`) |
| `init` | Generate a `browse.config.json` template (`--force` to overwrite) |
| `form --data <json>` | Bulk-fill form fields (`--auto-snapshot`) |
| `test-matrix --roles <r1,r2> --flow <name>` | Multi-role parallel testing (`--env`, `--reporter junit\|json\|markdown`) |
| `assert-ai "<assertion>"` | AI-powered visual assertion (`--model`, `--provider`, `--base-url`) |
| `replay [--out path]` | Generate interactive session replay HTML |
| `diff --baseline <url> --current <url>` | Visual diff across deployments (`--flow`, `--threshold`) |
| `flow-share export\|import\|list\|install\|publish` | Share and install reusable flows |
| `perf` | Core Web Vitals and performance timing (`--budget`, `--json`) |
| `security` | Security audit: headers, cookies, mixed content (`--json`) |
| `responsive` | Multi-viewport screenshot sweep (`--breakpoints`, `--url`, `--out`) |
| `extract table\|links\|meta\|select` | Structured data extraction (`--csv`, `--filter`, `--attr`) |
| `screenshots list\|clean\|count` | Manage saved screenshots (`--older-than`) |
| `completions bash\|zsh\|fish` | Output shell completion scripts |
| `version` | Print version and platform info |
| `quit` | Stop the daemon |
| `record start\|stop\|pause\|resume` | Interactive test recorder (`--output`, `--name`) |
| `crawl <url>` | Multi-page crawl/scrape pipeline (`--depth`, `--extract`, `--paginate`, `--rate-limit`) |
| `throttle <preset\|off\|status>` | Network throttling (slow-3g, 3g, 4g, wifi, cable) |
| `offline on\|off` | Toggle offline mode |
| `do "<instruction>"` | Natural language → browse commands via LLM (`--dry-run`, `--provider`) |
| `vrt init\|baseline\|check\|update\|list` | Visual regression testing workflow (`--threshold`) |
| `ci-init` | Scaffold CI/CD config (`--ci github\|gitlab\|circleci`) |
| `watch <flow-file>` | Watch flow file and re-run on changes |
| `repl` | Interactive REPL session |
| `seo [url]` | SEO audit: meta, headings, images, links, structured data (`--json`) |
| `subscribe` | Real-time event streaming (`--events`, `--level`, `--idle-timeout`) |
| `dev start\|stop\|status` | Dev server lifecycle management |
| `compliance [url]` | Cookie consent and privacy compliance audit (`--standard gdpr\|ccpa`) |
| `security-scan` | Active security scanning: XSS, CSP, clickjacking (`--checks`, `--json`) |
| `i18n --locales <list>` | Multi-locale testing: translations, RTL, overflow (`--url`, `--json`) |
| `api-assert <pattern>` | API contract testing from browser (`--status`, `--timing`, `--schema`) |
| `design-audit --tokens <file>` | Compare live styles against design tokens |
| `doc-capture --flow <file>` | Automated doc screenshots (`--output`, `--markdown`, `--update`) |
| `gesture <type>` | Touch gestures: swipe, long-press, double-tap, drag |
| `devices list\|search\|info` | Browse Playwright device profiles |
| `monitor check\|history\|status` | Scheduled site monitoring with alerts (`--config`) |
| `a11y coverage` | Accessibility coverage report |
| `a11y tree` | Full accessibility tree export |
| `a11y tab-order` | Keyboard navigation audit |
| `a11y headings` | Heading hierarchy check |

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 [Forjd.dev](https://forjd.dev)
