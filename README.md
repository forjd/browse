# browse

[![CI](https://github.com/forjd/browse/actions/workflows/ci.yml/badge.svg)](https://github.com/forjd/browse/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1.svg)](https://bun.sh)
[![Playwright](https://img.shields.io/badge/browser-Playwright-2ead33.svg)](https://playwright.dev)

A fast CLI for browser automation. Wraps Playwright behind a persistent daemon on a Unix socket — first call cold-starts in ~3s, every call after that runs in under 30ms.

Built for AI agents doing QA, but works just as well by hand.

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

### Screenshots and debugging

```sh
browse screenshot [path]            # full-page (auto-names if no path given)
browse screenshot --viewport        # viewport only
browse console                      # console messages since last call
browse console --level error        # filter by level
browse network                      # failed requests (4xx/5xx)
browse network --all                # all requests
```

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
```

### Tabs

```sh
browse tab list
browse tab new https://other.com
browse tab switch 2
browse tab close
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

### Flows and assertions

Define reusable flows in `browse.config.json`, then run them:

```sh
browse flow list
browse flow signup --var base_url=https://staging.example.com
browse assert text-contains "Welcome"
browse assert visible ".dashboard"
browse healthcheck --var base_url=https://staging.example.com
```

### Timeouts

Any command accepts `--timeout <ms>` (default: 30s):

```sh
browse goto https://slow-page.com --timeout 60000
```

Unrecognised flags on any command produce an error with a hint to check `browse help <command>`.

## Configuration

Optional. Create `browse.config.json` in your project root to configure login environments, reusable flows, permission checks, and health checks.

```json
{
  "environments": {
    "staging": {
      "loginUrl": "https://staging.example.com/login",
      "userEnvVar": "STAGING_USER",
      "passEnvVar": "STAGING_PASS",
      "usernameField": "input[name=email]",
      "passwordField": "input[name=password]",
      "submitButton": "button[type=submit]",
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
  "timeout": 45000
}
```

## Architecture

The daemon spawns on first use and stays alive for 30 minutes of inactivity. It owns a single Chromium instance and communicates over a Unix socket at `/tmp/browse-daemon.sock`. The CLI is a thin client that serialises commands as JSON and prints responses.

> **Note:** Rebuilding the binary does not restart a running daemon. If you rebuild after adding or changing commands, run `browse quit` first so the next call cold-starts with the new binary.

```
CLI ──JSON──▶ Unix socket ──▶ Daemon ──▶ Playwright ──▶ Chromium
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
| `screenshot [path]` | Capture page (`--viewport`, `--selector`) |
| `console` | Console log (`--level`, `--keep`) |
| `network` | Failed requests (`--all`, `--keep`) |
| `eval <expression>` | Run JavaScript in page context |
| `page-eval <expression>` | Run Playwright page-level operations |
| `viewport [W H\|WxH]` | Get or set viewport (`--device`, `--preset`) |
| `tab list\|new\|switch\|close` | Tab management |
| `login --env <name>` | Configured login |
| `auth-state save\|load <path>` | Session import/export |
| `flow list\|<name>` | Run configured flows |
| `assert <type> <args>` | Assertions (visible, text, url, element, permission) |
| `healthcheck` | Multi-page health check |
| `wipe` | Clear all session data |
| `benchmark` | Measure latency |
| `quit` | Stop the daemon |

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 [Forjd.dev](https://forjd.dev)
