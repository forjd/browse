# Command Reference

Full command reference for the `browse` CLI tool — a browser automation CLI wrapping Playwright.

Commands are grouped by category. Global flags are documented at the end.

---

## Navigation

### goto

```
browse goto <url> [--viewport WxH] [--device name] [--preset name] [--auto-snapshot]
```

Navigate to a URL and return the page title.

| Flag | Description |
|------|-------------|
| `--viewport WxH` | Set viewport dimensions (e.g. `1280x720`) |
| `--device name` | Emulate a named device |
| `--preset name` | Use a viewport preset: `mobile` (375x667), `tablet` (768x1024), `desktop` (1440x900) |
| `--auto-snapshot` | Automatically snapshot after navigation completes |

**Examples:**

```bash
browse goto https://example.com
browse goto https://example.com --preset mobile
browse goto https://example.com --viewport 1280x720
browse goto https://example.com --auto-snapshot
```

### url

```
browse url
```

Print the current page URL.

### back

```
browse back
```

Navigate back in browser history.

### forward

```
browse forward
```

Navigate forward in browser history.

### reload

```
browse reload [--hard]
```

Reload the current page.

| Flag | Description |
|------|-------------|
| `--hard` | Clear browser cache before reloading |

**Examples:**

```bash
browse reload
browse reload --hard
```

### text

```
browse text
```

Return the visible text content of the page.

---

## Observation

### snapshot

```
browse snapshot [-i] [-f] [--json]
```

Show page elements with refs (`@e1`, `@e2`, etc.). By default, only interactive elements are shown.

| Flag | Description |
|------|-------------|
| `-i` | Inclusive mode — include structural nodes that have names |
| `-f` | Full mode — include all nodes |
| `--json` | Output as JSON |

**Examples:**

```bash
browse snapshot
browse snapshot -i
browse snapshot -f
browse snapshot --json
```

### screenshot

```
browse screenshot [path] [--viewport] [--selector <css-selector>] [--diff <baseline>] [--threshold <n>]
```

Capture a screenshot of the page. If no path is given, the file is automatically named and saved to `~/.bun-browse/screenshots/`.

| Flag | Description |
|------|-------------|
| `--viewport` | Capture viewport only (not the full page) |
| `--selector <css-selector>` | Screenshot a specific element |
| `--diff <baseline.png>` | Compare against a baseline image and produce a diff image + similarity score |
| `--threshold <n>` | Per-channel diff threshold (0-255, default: 10). Pixels with all channel diffs below this are considered identical |

**Examples:**

```bash
browse screenshot
browse screenshot /tmp/page.png
browse screenshot --viewport
browse screenshot --selector ".hero-banner"
browse screenshot /tmp/current.png --diff /tmp/baseline.png
browse screenshot /tmp/current.png --diff /tmp/baseline.png --threshold 5
```

With `--diff`, output includes the similarity percentage, diff pixel count, and path to the generated diff image. Changed pixels are highlighted in red; unchanged regions are dimmed grayscale.

### console

```
browse console [--level <level>] [--keep] [--json]
```

Show console messages captured since the last call. Messages are drained after reading unless `--keep` is used.

| Flag | Description |
|------|-------------|
| `--level <level>` | Filter by level: `log`, `info`, `warning`, `error`, `debug` |
| `--keep` | Peek without draining the buffer |
| `--json` | Output as JSON |

**Examples:**

```bash
browse console
browse console --level error
browse console --keep --json
```

### network

```
browse network [--all] [--keep] [--json]
```

Show captured network requests. By default, only requests with status >= 400 are shown.

| Flag | Description |
|------|-------------|
| `--all` | Show all requests, not just failures |
| `--keep` | Peek without draining the buffer |
| `--json` | Output as JSON |

**Examples:**

```bash
browse network
browse network --all
browse network --all --json
```

### title

```
browse title
```

Get the page title.

### html

```
browse html [selector|@ref]
```

Get page or element HTML. Without arguments, returns the full page HTML. With a selector or ref, returns the `outerHTML` of the matched element.

**Examples:**

```bash
browse html
browse html @e3
browse html ".main-content"
```

### element-count

```
browse element-count <selector|@ref>
```

Count elements matching a CSS selector or ref.

**Examples:**

```bash
browse element-count "li.item"
browse element-count @e5
```

---

## Interaction

### click

```
browse click <@ref> [--auto-snapshot]
```

Click an element by its ref.

| Flag | Description |
|------|-------------|
| `--auto-snapshot` | Automatically snapshot after the click completes |

**Examples:**

```bash
browse click @e4
browse click @e4 --auto-snapshot
```

### fill

```
browse fill <@ref> <value>
```

Fill an input element. Supported roles: `textbox`, `searchbox`, `spinbutton`, `combobox`.

**Examples:**

```bash
browse fill @e3 "hello world"
browse fill @e7 "user@example.com"
```

### select

```
browse select <@ref> <option>
```

Select a dropdown option. Supported roles: `combobox`, `listbox`.

**Examples:**

```bash
browse select @e5 "United Kingdom"
```

### hover

```
browse hover <@ref> [--duration <ms>]
```

Hover over an element.

| Flag | Description |
|------|-------------|
| `--duration <ms>` | Hold the hover for a specified duration (useful for delayed tooltips) |

**Examples:**

```bash
browse hover @e2
browse hover @e2 --duration 2000
```

### press

```
browse press <key> [key ...] [--auto-snapshot]
```

Send keyboard key presses. Supports single keys, combinations with `+`, and multiple sequential keys. Key names follow Playwright conventions (`Tab`, `Enter`, `Escape`, `ArrowDown`, etc.).

| Flag | Description |
|------|-------------|
| `--auto-snapshot` | Automatically snapshot after the key press completes |

**Examples:**

```bash
browse press Tab
browse press Enter
browse press Control+a
browse press Tab Tab Enter
browse press Enter --auto-snapshot
```

### scroll

```
browse scroll down|up|top|bottom|<@ref>|<x> <y>
```

Scroll the page or bring an element into view. `down` and `up` scroll by one viewport height.

**Examples:**

```bash
browse scroll down
browse scroll up
browse scroll top
browse scroll bottom
browse scroll @e12
browse scroll 0 500
```

### upload

```
browse upload <@ref> <file> [file ...]
```

Set file(s) on a file input using Playwright's `setInputFiles()`.

**Examples:**

```bash
browse upload @e8 /tmp/photo.png
browse upload @e8 /tmp/a.pdf /tmp/b.pdf
```

### attr

```
browse attr <@ref> [attribute]
```

Read element attributes. With a single attribute name, returns its value. Without an attribute name, returns all attributes as `key=value` pairs.

**Examples:**

```bash
browse attr @e3 href
browse attr @e3 class
browse attr @e3
```

---

## Waiting

All wait subcommands respect `--timeout` and poll at 100ms intervals.

### wait url

```
browse wait url <substring>
```

Wait until the URL contains the given substring.

### wait text

```
browse wait text <string>
```

Wait until the page text contains the given string.

### wait visible

```
browse wait visible <selector|@ref>
```

Wait until an element is visible.

### wait hidden

```
browse wait hidden <selector|@ref>
```

Wait until an element disappears.

### wait network-idle

```
browse wait network-idle
```

Wait until there are no pending network requests.

### wait (fixed delay)

```
browse wait <ms>
```

Fixed delay in milliseconds. Use as a last resort.

**Examples:**

```bash
browse wait url "/dashboard"
browse wait text "Welcome back"
browse wait visible @e5
browse wait hidden ".loading-spinner"
browse wait network-idle
browse wait 1000
```

---

## JavaScript Evaluation

### eval

```
browse eval <expression>
```

Run JavaScript in the page context via `page.evaluate()`. Objects are JSON-stringified.

**Examples:**

```bash
browse eval "document.title"
browse eval "window.innerWidth"
browse eval "document.querySelectorAll('a').length"
```

### page-eval

```
browse page-eval <expression>
```

Run Playwright page-level operations. Has access to the `page` object. Supports `async`/`await`.

**Examples:**

```bash
browse page-eval "await page.title()"
browse page-eval "await page.locator('h1').textContent()"
```

---

## Authentication

### login

```
browse login --env <environment>
```

Log in using a configured environment from `browse.config.json`. Credentials are sourced from environment variables.

**Examples:**

```bash
browse login --env staging
browse login --env production
```

### auth-state save

```
browse auth-state save <path>
```

Save cookies and localStorage to a file.

**Examples:**

```bash
browse auth-state save /tmp/auth.json
```

### auth-state load

```
browse auth-state load <path>
```

Load cookies and localStorage from a file.

**Examples:**

```bash
browse auth-state load /tmp/auth.json
```

### wipe

```
browse wipe
```

Clear cookies, localStorage, sessionStorage, tabs, and buffers without stopping the daemon.

---

## Sessions

Use `--session <name>` on any command to route it to a named session.

### session list

```
browse session list
```

List all sessions.

### session create

```
browse session create <name> [--isolated]
```

Create a new session. By default, sessions share a browser context. Use `--isolated` for a fully separate browser context with its own cookies and storage.

| Flag | Description |
|------|-------------|
| `--isolated` | Create a fully separate browser context (separate cookies, storage) |

**Examples:**

```bash
browse session create admin
browse session create guest --isolated
```

### session close

```
browse session close <name>
```

Close a session and its pages.

**Examples:**

```bash
browse session close admin
```

---

## Tabs

### tab list

```
browse tab list
```

List open tabs.

### tab new

```
browse tab new [url]
```

Open a new tab, optionally navigating to a URL.

**Examples:**

```bash
browse tab new
browse tab new https://example.com
```

### tab switch

```
browse tab switch <index>
```

Switch to a tab by index (1-indexed).

**Examples:**

```bash
browse tab switch 2
```

### tab close

```
browse tab close [index]
```

Close a tab. Closes the active tab if no index is given.

**Examples:**

```bash
browse tab close
browse tab close 3
```

---

## Assertions

### assert visible

```
browse assert visible <selector|@ref>
```

Assert that an element is visible.

### assert not-visible

```
browse assert not-visible <selector|@ref>
```

Assert that an element is not visible.

### assert text-contains

```
browse assert text-contains <text>
```

Assert that the page contains the given text.

### assert text-not-contains

```
browse assert text-not-contains <text>
```

Assert that the page does not contain the given text.

### assert url-contains

```
browse assert url-contains <substring>
```

Assert that the URL contains a substring.

### assert url-pattern

```
browse assert url-pattern <regex>
```

Assert that the URL matches a regular expression.

### assert element-text

```
browse assert element-text <selector|@ref> <text>
```

Assert that an element's text contains the given value.

### assert element-count

```
browse assert element-count <selector|@ref> <n>
```

Assert that the count of matching elements equals `n`.

### assert permission

```
browse assert permission <name> granted|denied [--var k=v ...]
```

Assert a permission check. Uses permission definitions from `browse.config.json`.

| Flag | Description |
|------|-------------|
| `--var k=v` | Pass variables (repeatable) |

**Examples:**

```bash
browse assert visible @e3
browse assert not-visible ".modal"
browse assert text-contains "Dashboard"
browse assert text-not-contains "Error"
browse assert url-contains "/settings"
browse assert url-pattern "^https://.*\\.example\\.com"
browse assert element-text @e5 "Submitted"
browse assert element-count "tr.row" 10
browse assert permission admin-panel granted --var role=admin
```

---

## Flows and Healthcheck

### flow list

```
browse flow list
```

List all defined flows.

### flow

```
browse flow <name> [--var k=v ...] [--continue-on-error] [--reporter junit] [--dry-run] [--stream] [--webhook <url>]
```

Execute a named flow defined in `browse.config.json`.

| Flag | Description |
|------|-------------|
| `--var k=v` | Pass variables (repeatable) |
| `--continue-on-error` | Continue executing steps after a failure |
| `--reporter <format>` | Output format: `junit` (JUnit XML for CI integration) |
| `--dry-run` | Preview steps without executing them |
| `--stream` | Output real-time NDJSON with one object per step |
| `--webhook <url>` | POST a JSON result payload to the URL on completion |

**Examples:**

```bash
browse flow login --var user=admin --var pass=secret
browse flow checkout --continue-on-error
browse flow smoke-test --reporter junit > results.xml
browse flow signup --dry-run
browse flow smoke-test --stream
browse flow smoke-test --webhook https://hooks.slack.com/services/T.../B.../xxx
```

### healthcheck

```
browse healthcheck [--var k=v ...] [--no-screenshots] [--reporter junit] [--parallel] [--concurrency N] [--webhook <url>]
```

Run a healthcheck across configured pages defined in `browse.config.json`.

| Flag | Description |
|------|-------------|
| `--var k=v` | Pass variables (repeatable) |
| `--no-screenshots` | Skip screenshots during the healthcheck |
| `--reporter <format>` | Output format: `junit` (JUnit XML for CI integration) |
| `--parallel` | Check pages concurrently instead of sequentially |
| `--concurrency N` | Max concurrent pages when `--parallel` is set (default: 5) |
| `--webhook <url>` | POST a JSON result payload to the URL on completion |

**Examples:**

```bash
browse healthcheck
browse healthcheck --var env=staging
browse healthcheck --no-screenshots
browse healthcheck --reporter junit > results.xml
browse healthcheck --parallel --concurrency 8
browse healthcheck --webhook https://hooks.slack.com/services/T.../B.../xxx
```

---

## Accessibility

### a11y

```
browse a11y [@ref] [--standard <std>] [--json] [--include <sel>] [--exclude <sel>]
```

Run an accessibility audit powered by axe-core.

| Flag | Description |
|------|-------------|
| `@ref` | Scope audit to a specific element |
| `--standard <std>` | Standard to audit against: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice` |
| `--json` | Output as JSON |
| `--include <sel>` | Include only this CSS region |
| `--exclude <sel>` | Exclude this CSS region |

**Examples:**

```bash
browse a11y
browse a11y --standard wcag22aa
browse a11y @e5
browse a11y --include ".main" --exclude ".ad-banner"
browse a11y --standard wcag2aa --json
```

---

## Dialogs

### dialog accept

```
browse dialog accept [text]
```

Accept a pending dialog. Optionally provide input text for prompt dialogs.

**Examples:**

```bash
browse dialog accept
browse dialog accept "confirmed"
```

### dialog dismiss

```
browse dialog dismiss
```

Dismiss a pending dialog.

### dialog status

```
browse dialog status
```

Show pending dialog info and auto-mode state.

### dialog auto-accept

```
browse dialog auto-accept
```

Automatically accept all future dialogs.

### dialog auto-dismiss

```
browse dialog auto-dismiss
```

Automatically dismiss all future dialogs.

### dialog auto-off

```
browse dialog auto-off
```

Disable auto-mode and queue dialogs for manual handling.

---

## Downloads

### download wait

```
browse download wait [--save-to <path>] [--timeout <ms>]
  [--expect-type <mime>] [--expect-min-size <bytes>] [--expect-max-size <bytes>]
```

Wait for and save file downloads with optional content verification. Returns file metadata (filename, path, URL, size, MIME type) on success. Checks `download.failure()` and returns an error if the download failed.

| Flag | Description |
|------|-------------|
| `--save-to <path>` | Save the downloaded file to a specific path |
| `--timeout <ms>` | Override the default timeout |
| `--expect-type <mime>` | Validate file MIME type (e.g. `application/pdf`) |
| `--expect-min-size <bytes>` | Minimum file size in bytes |
| `--expect-max-size <bytes>` | Maximum file size in bytes |

**Examples:**

```bash
browse download wait
browse download wait --save-to /tmp/report.csv
browse download wait --timeout 60000
browse download wait --expect-type application/pdf --expect-min-size 1024
browse download wait --save-to /tmp/data.zip --expect-max-size 10485760
```

---

## Iframes

### frame list

```
browse frame list
```

List all frames on the page.

### frame switch

```
browse frame switch <target>
```

Switch to a frame by index, name, or URL substring.

**Examples:**

```bash
browse frame switch 0
browse frame switch "content-frame"
browse frame switch "embed.example.com"
```

### frame main

```
browse frame main
```

Show main frame info.

---

## Network Interception

### intercept add

```
browse intercept add <pattern> [--status N] [--body data] [--content-type type]
```

Add a mock rule for matching requests. Defaults: status `200`, body `""`, content-type `application/json`.

| Flag | Description |
|------|-------------|
| `--status N` | HTTP status code to return |
| `--body data` | Response body |
| `--content-type type` | Response content type |

**Examples:**

```bash
browse intercept add "**/api/user" --status 200 --body '{"name":"Test"}'
browse intercept add "**/api/error" --status 500 --body '{"error":"fail"}'
browse intercept add "**/data.csv" --body "a,b,c" --content-type text/csv
```

### intercept remove

```
browse intercept remove <pattern>
```

Remove a mock rule by pattern.

### intercept list

```
browse intercept list
```

List all active interception rules.

### intercept clear

```
browse intercept clear
```

Remove all interception rules.

---

## Inspection

### cookies

```
browse cookies [--domain <domain>] [--json]
```

Inspect browser cookies.

| Flag | Description |
|------|-------------|
| `--domain <domain>` | Filter by domain substring |
| `--json` | Output as JSON |

**Examples:**

```bash
browse cookies
browse cookies --domain example.com
browse cookies --json
```

### storage

```
browse storage local|session [--json]
```

Inspect localStorage or sessionStorage.

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |

**Examples:**

```bash
browse storage local
browse storage session
browse storage local --json
```

### pdf

```
browse pdf [path]
```

Export the page as a PDF. If no path is given, the file is automatically named and saved to `~/.bun-browse/exports/`.

**Examples:**

```bash
browse pdf
browse pdf /tmp/page.pdf
```

### viewport

```
browse viewport [W H|WxH] [--device name] [--preset name]
```

Get or set the viewport. Without arguments, shows the current viewport dimensions.

| Flag | Description |
|------|-------------|
| `--device name` | Emulate a named device |
| `--preset name` | Use a preset: `mobile`, `tablet`, `desktop` |

**Examples:**

```bash
browse viewport
browse viewport 1280 720
browse viewport 1280x720
browse viewport --preset tablet
```

---

## Daemon

### ping

```
browse ping
```

Check if the daemon is alive. Returns `pong`.

### status

```
browse status [--json] [--watch [--interval N]] [--exit-code]
```

Show sessions, uptime, URLs, and tab counts per session. With `--json`, outputs machine-readable JSON including memory usage, browser version, daemon PID, and per-session details.

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON with extended details (memory, browser version, PID) |
| `--watch` | Continuously poll and display status. Plain text clears and redraws; with `--json` outputs one JSON object per line (NDJSON) |
| `--interval <seconds>` | Polling interval for `--watch` (default: 5) |
| `--exit-code` | Exit `0` if the daemon is healthy, `1` if unhealthy. Useful for Kubernetes/Docker health probes |

**Examples:**

```bash
browse status
browse status --json
browse status --watch
browse status --watch --interval 10
browse status --watch --json
browse status --exit-code
```

**Container health probe example:**

```yaml
livenessProbe:
  exec:
    command: ["browse", "status", "--exit-code"]
  periodSeconds: 10
```

### benchmark

```
browse benchmark [--iterations N]
```

Measure command latency. Defaults to 10 iterations.

| Flag | Description |
|------|-------------|
| `--iterations N` | Number of iterations to run |

**Examples:**

```bash
browse benchmark
browse benchmark --iterations 50
```

### version

```
browse version
```

Print version and platform info. Runs client-side — no daemon needed.

### quit

```
browse quit
```

Shut down the daemon.

---

## Tracing

### trace start

```
browse trace start [--screenshots] [--snapshots]
```

Start recording a Playwright trace. While recording, all page actions are captured for later analysis in the Playwright Trace Viewer.

| Flag | Description |
|------|-------------|
| `--screenshots` | Include screenshots in the trace |
| `--snapshots` | Include DOM snapshots in the trace |

**Examples:**

```bash
browse trace start
browse trace start --screenshots --snapshots
```

### trace stop

```
browse trace stop [--out <path>]
```

Stop recording and save the trace to a file.

| Flag | Description |
|------|-------------|
| `--out <path>` | Output path for the trace file (default: `~/.bun-browse/traces/`) |

**Examples:**

```bash
browse trace stop
browse trace stop --out /tmp/my-trace.zip
```

### trace view

```
browse trace view [<path>] [--latest] [--port <port>]
```

Open a trace file in the Playwright Trace Viewer. Launches the viewer as a background process.

| Flag | Description |
|------|-------------|
| `--latest` | View the most recently saved trace |
| `--port <port>` | Serve the trace viewer on a specific port |

**Examples:**

```bash
browse trace view /tmp/my-trace.zip
browse trace view --latest
browse trace view --latest --port 9300
```

### trace list

```
browse trace list
```

List all saved trace files in `~/.bun-browse/traces/`, sorted newest-first. Shows filename, size, and date.

**Examples:**

```bash
browse trace list
```

### trace status

```
browse trace status
```

Check whether a trace is currently recording.

---

## Video Recording

### video start

```
browse video start [--size <WxH>]
```

Start recording the active tab as a video. Creates a new browser context with video capture enabled, copies cookies from the current session, and navigates to the current URL. All subsequent commands are captured in the recording.

| Flag | Description |
|------|-------------|
| `--size <WxH>` | Video resolution (default: current viewport or 1280x720) |

**Examples:**

```bash
browse video start
browse video start --size 1280x720
browse video start --size 640x480
```

### video stop

```
browse video stop [--out <path>]
```

Stop recording and save the video file. Restores the original page as the active tab.

| Flag | Description |
|------|-------------|
| `--out <path>` | Output path for the video file (default: `~/.bun-browse/videos/`) |

**Examples:**

```bash
browse video stop
browse video stop --out /tmp/my-recording.webm
```

### video status

```
browse video status
```

Check whether a video recording is currently in progress.

### video list

```
browse video list
```

List all saved video files in `~/.bun-browse/videos/`, sorted newest-first. Shows filename, size, and date.

---

## Project Setup

### init

```
browse init [path] [--force]
```

Generate a `browse.config.json` template with sample environment, flow, and healthcheck configurations.

| Flag | Description |
|------|-------------|
| `--force` | Overwrite existing config file |

**Examples:**

```bash
browse init
browse init ./my-project/browse.config.json
browse init --force
```

---

## Screenshot Management

### screenshots list

```
browse screenshots list
```

List all saved screenshots sorted by date.

### screenshots clean

```
browse screenshots clean [--older-than <duration>] [--dry-run]
```

Delete screenshots older than the specified duration.

| Flag | Description |
|------|-------------|
| `--older-than <duration>` | Duration threshold (e.g. `7d`, `24h`, `30m`) |
| `--dry-run` | Preview which files would be deleted without removing them |

**Examples:**

```bash
browse screenshots clean --older-than 7d
browse screenshots clean --older-than 24h
browse screenshots clean --older-than 7d --dry-run
```

### screenshots count

```
browse screenshots count
```

Show total number and size of saved screenshots.

---

## Reporting

### report

```
browse report --out <path> [--title <title>] [--screenshots <dir>]
```

Generate a self-contained HTML report from saved screenshots. Images are embedded as base64 data URIs.

| Flag | Description |
|------|-------------|
| `--out <path>` | Required. Output path for the HTML file |
| `--title <title>` | Report title (default: "Browse QA Report") |
| `--screenshots <dir>` | Screenshot directory to scan (default: `~/.bun-browse/screenshots`) |

**Examples:**

```bash
browse report --out report.html
browse report --out report.html --title "QA Run 2026-03-16"
browse report --out report.html --screenshots ./my-screenshots
```

---

## Shell Completions

### completions

```
browse completions <shell>
```

Output shell completion scripts. Supported shells: `bash`, `zsh`, `fish`.

**Examples:**

```bash
eval "$(browse completions bash)"    # add to ~/.bashrc
eval "$(browse completions zsh)"     # add to ~/.zshrc
browse completions fish | source     # add to fish config
```

---

## Form Filling

### form

```sh
browse form --data <json> [--auto-snapshot]
```

Bulk-fill form fields from a JSON object. Maps field names to values and attempts to fill using ARIA roles (textbox, searchbox, combobox, checkbox, radio, switch) or falls back to `getByLabel`.

| Flag | Description |
|------|-------------|
| `--data <json>` | JSON object mapping field names to values |
| `--auto-snapshot` | Snapshot after filling all fields |

**Examples:**

```bash
browse form --data '{"name":"Jane","email":"jane@example.com"}'
browse form --data '{"agree":true,"plan":"premium"}' --auto-snapshot
```

---

## AI Assertions

### assert-ai

```sh
browse assert-ai "<assertion>" [--model <model>] [--provider <provider>] [--base-url <url>]
```

AI-powered visual assertion. Takes a screenshot and sends it to an AI model to evaluate whether the assertion passes. Requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` environment variable.

Supports any OpenAI-compatible provider (OpenRouter, Groq, Together, Ollama, etc.) via `--base-url` or the `OPENAI_BASE_URL` environment variable.

| Flag | Description |
|------|-------------|
| `--model <model>` | Model to use (default: `claude-sonnet-4-20250514` for Anthropic, `gpt-4o` for OpenAI) |
| `--provider <provider>` | AI provider: `anthropic` (default) or `openai` |
| `--base-url <url>` | Custom API base URL for OpenAI-compatible providers. Auto-selects `openai` provider when set. |

**Environment variables:**

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Required for Anthropic provider (default) |
| `OPENAI_API_KEY` | Required for OpenAI provider and compatible providers |
| `OPENAI_BASE_URL` | Custom base URL (alternative to `--base-url` flag) |

**Examples:**

```bash
browse assert-ai "the login form is visible"
browse assert-ai "the page shows a dashboard with charts"
browse assert-ai "there are no error messages" --provider openai
browse assert-ai "the navigation menu has 5 items" --model claude-sonnet-4-20250514
browse assert-ai "page looks correct" --base-url https://openrouter.ai/api/v1 --model anthropic/claude-sonnet-4-20250514
```

---

## Multi-Role Testing

### test-matrix

```sh
browse test-matrix --roles <role1,role2,...> --flow <flow-name> [--env <env>] [--reporter junit]
```

Run the same flow in parallel across multiple roles/environments. Each role gets its own isolated browser context with separate authentication. Compares results across roles and highlights differences.

Roles must correspond to environment names in `browse.config.json`.

| Flag | Description |
|------|-------------|
| `--roles <r1,r2,...>` | Comma-separated list of roles (minimum 2) |
| `--flow <name>` | Flow to execute (from `browse.config.json`) |
| `--env <name>` | Environment prefix (tries `<env>-<role>` then `<role>`) |
| `--reporter junit` | Output JUnit XML format |

**Examples:**

```bash
browse test-matrix --roles admin,viewer,guest --flow checkout
browse test-matrix --roles admin,viewer --flow dashboard --env staging
browse test-matrix --roles admin,viewer --flow dashboard --reporter junit > results.xml
```

---

## Visual Diffing

### diff

```sh
browse diff --baseline <url> --current <url> [--flow <name>] [--threshold <n>] [--var k=v]
```

Visual diff across two deployments. Navigates to matching pages on both baseline and current URLs, screenshots each, and compares pixel similarity.

If `--flow` is specified, extracts goto URLs from the flow steps. Otherwise, uses healthcheck pages from config.

| Flag | Description |
|------|-------------|
| `--baseline <url>` | Baseline deployment URL |
| `--current <url>` | Current deployment URL |
| `--flow <name>` | Flow whose goto steps define pages to compare |
| `--threshold <n>` | Pixel difference threshold (default: 10). Lower values are stricter. |
| `--var k=v` | Pass variables (repeatable) |

**Examples:**

```bash
browse diff --baseline https://staging.example.com --current https://prod.example.com
browse diff --baseline https://v1.example.com --current https://v2.example.com --flow smoke-test
browse diff --baseline https://old.example.com --current https://new.example.com --threshold 50
```

---

## Session Replay

### replay

```sh
browse replay [session] [--out <path>]
browse replay list
```

Generate an interactive HTML timeline from session screenshots. The replay page includes a clickable timeline, embedded screenshots, autoplay, and keyboard navigation (arrow keys, spacebar).

| Flag | Description |
|------|-------------|
| `--out <path>` | Output path for the HTML file |

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `list` | List available replay recordings |

**Examples:**

```bash
browse replay --out replay.html
browse replay list
```

---

## Flow Sharing

### flow-share

```sh
browse flow-share <subcommand> [args]
```

Share and install reusable flow definitions. Flows are stored in a local registry at `~/.bun-browse/flow-registry/`.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `export <flow-name>` | Export a flow from config to a `.flow.json` file |
| `import <file>` | Import a `.flow.json` file to the local registry |
| `list` | List installed flows in the registry |
| `install <url>` | Install a flow from a GitHub raw URL |
| `publish <flow-name>` | Publish a flow from config to the local registry |

**Examples:**

```bash
browse flow-share export checkout
browse flow-share import ./checkout.flow.json
browse flow-share list
browse flow-share install https://raw.githubusercontent.com/user/repo/main/flows/login.flow.json
browse flow-share publish smoke-test
```

---

## Global Flags

These flags work with any command.

| Flag | Description |
|------|-------------|
| `--timeout <ms>` | Override the default timeout (30s) |
| `--session <name>` | Route the command to a named session |
| `--json` | Output results in JSON (supported by: `snapshot`, `console`, `network`, `cookies`, `storage`, `a11y`, `assert`, `status`) |
| `--config <path>` | Path to `browse.config.json` (default: search upward from cwd, then `~/.browse/config.json`) |
| `--auto-snapshot` | Auto-snapshot after action/interaction (supported by: `goto`, `click`, `press`, `form`) |
| `--help` | Show help for any command |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BROWSE_HEADED=1` | Launch browser in headed (visible) mode for debugging |

**Examples:**

```bash
browse goto https://example.com --timeout 60000
browse snapshot --session admin --json
browse --config /path/to/browse.config.json flow smoke-test
BROWSE_HEADED=1 browse goto https://example.com
browse help goto
```
