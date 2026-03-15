# Command Reference

Full command reference for the `browse` CLI tool — a browser automation CLI wrapping Playwright.

Commands are grouped by category. Global flags are documented at the end.

---

## Navigation

### goto

```
browse goto <url> [--viewport WxH] [--device name] [--preset name]
```

Navigate to a URL and return the page title.

| Flag | Description |
|------|-------------|
| `--viewport WxH` | Set viewport dimensions (e.g. `1280x720`) |
| `--device name` | Emulate a named device |
| `--preset name` | Use a viewport preset: `mobile` (375x667), `tablet` (768x1024), `desktop` (1440x900) |

**Examples:**

```bash
browse goto https://example.com
browse goto https://example.com --preset mobile
browse goto https://example.com --viewport 1280x720
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
browse snapshot [-i] [-f]
```

Show page elements with refs (`@e1`, `@e2`, etc.). By default, only interactive elements are shown.

| Flag | Description |
|------|-------------|
| `-i` | Inclusive mode — include structural nodes that have names |
| `-f` | Full mode — include all nodes |

**Examples:**

```bash
browse snapshot
browse snapshot -i
browse snapshot -f
browse snapshot --json
```

### screenshot

```
browse screenshot [path] [--viewport] [--selector <css-selector>]
```

Capture a screenshot of the page. If no path is given, the file is automatically named and saved to `~/.bun-browse/screenshots/`.

| Flag | Description |
|------|-------------|
| `--viewport` | Capture viewport only (not the full page) |
| `--selector <css-selector>` | Screenshot a specific element |

**Examples:**

```bash
browse screenshot
browse screenshot /tmp/page.png
browse screenshot --viewport
browse screenshot --selector ".hero-banner"
```

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
browse click <@ref>
```

Click an element by its ref.

**Examples:**

```bash
browse click @e4
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
browse press <key> [key ...]
```

Send keyboard key presses. Supports single keys, combinations with `+`, and multiple sequential keys. Key names follow Playwright conventions (`Tab`, `Enter`, `Escape`, `ArrowDown`, etc.).

**Examples:**

```bash
browse press Tab
browse press Enter
browse press Control+a
browse press Tab Tab Enter
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
browse flow <name> [--var k=v ...] [--continue-on-error]
```

Execute a named flow defined in `browse.config.json`.

| Flag | Description |
|------|-------------|
| `--var k=v` | Pass variables (repeatable) |
| `--continue-on-error` | Continue executing steps after a failure |

**Examples:**

```bash
browse flow login --var user=admin --var pass=secret
browse flow checkout --continue-on-error
```

### healthcheck

```
browse healthcheck [--var k=v ...] [--no-screenshots]
```

Run a healthcheck across configured pages defined in `browse.config.json`.

| Flag | Description |
|------|-------------|
| `--var k=v` | Pass variables (repeatable) |
| `--no-screenshots` | Skip screenshots during the healthcheck |

**Examples:**

```bash
browse healthcheck
browse healthcheck --var env=staging
browse healthcheck --no-screenshots
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
```

Wait for and save file downloads.

| Flag | Description |
|------|-------------|
| `--save-to <path>` | Save the downloaded file to a specific path |
| `--timeout <ms>` | Override the default timeout |

**Examples:**

```bash
browse download wait
browse download wait --save-to /tmp/report.csv
browse download wait --timeout 60000
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
browse status
```

Show sessions, uptime, URLs, and tab counts per session.

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

## Global Flags

These flags work with any command.

| Flag | Description |
|------|-------------|
| `--timeout <ms>` | Override the default timeout (30s) |
| `--session <name>` | Route the command to a named session |
| `--json` | Request JSON output (supported by: `snapshot`, `console`, `network`, `cookies`, `storage`, `a11y`, `assert`) |
| `--help` | Show help for any command |

**Examples:**

```bash
browse goto https://example.com --timeout 60000
browse snapshot --session admin --json
browse help goto
```
