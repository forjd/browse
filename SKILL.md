---
name: bun-browser
description: AI-agent-driven browser automation via a persistent Playwright daemon. Use for QA verification, visual checks, form interaction, auth testing, screenshots, and automated healthchecks against web applications.
allowed-tools: Bash(browse:*)
---

# Browse — Browser QA Tool

## Overview

`browse` is a CLI tool for AI-agent-driven browser automation. It wraps Playwright behind a persistent daemon that listens on a Unix socket, so every command after the first cold-start (~3s) runs in sub-200ms. Session state (cookies, localStorage, auth tokens) persists across commands. Use it for QA verification, visual checks, form interaction, auth testing, and automated healthchecks.

## Quick start

Just run any command — the daemon cold-starts automatically if it isn't already running.

```
browse help                                # list all commands
browse goto https://staging.example.com    # navigate
browse snapshot                            # see page structure with refs
browse screenshot                          # capture the page
browse quit                                # shut down the daemon
```

Run `browse help <command>` for detailed usage of any command.

First useful sequence: `browse goto <url>` → `browse snapshot` → `browse screenshot`.

## Command reference

### Navigation and content

```
browse help [command]                      Show all commands, or detailed usage for one
browse goto <url>                          Navigate to URL, return page title
browse goto <url> --viewport <WxH>        Navigate at a specific viewport size
browse goto <url> --device <name>         Navigate with a Playwright device profile
browse goto <url> --preset <name>         Navigate with a preset (mobile/tablet/desktop)
browse text                                Return visible text content of the page
browse quit                                Shut down the daemon
browse wipe                                Clear all session data (cookies, storage, buffers, refs)
browse benchmark [--iterations N]          Measure command latency (p50/p95/p99)
```

### Timeout control

Any command accepts `--timeout <ms>` to override the default 30s timeout:

```
browse goto https://slow-page.example.com --timeout 60000
```

Timeout precedence: `--timeout` flag > config file `timeout` > 30s default. Commands `quit` and `benchmark` are exempt from timeout.

Unrecognised flags on any command produce an error with a hint to check `browse help <command>`.

### Snapshot and interaction (ref system)

```
browse snapshot                            Interactive elements with refs (@e1, @e2, ...)
browse snapshot -i                         Include structural elements (headings, text)
browse snapshot -f                         Full accessibility tree dump
browse click @eN                           Click element by ref
browse fill @eN "value"                    Fill input by ref (clears first)
browse select @eN "option"                 Select dropdown option by visible text
```

### Visual and debugging

```
browse screenshot [path]                   Full-page screenshot (auto-generates path if omitted)
browse screenshot --viewport               Viewport only (no scroll)
browse screenshot --selector ".css"        Element-level screenshot
browse console                             Console messages since last call (drains buffer)
browse console --level error               Filter to a specific level (error, warning, log, info, debug)
browse console --keep                      Return messages without clearing the buffer
browse network                             Failed requests (4xx/5xx) since last call (drains buffer)
browse network --all                       All requests including successful ones
browse network --keep                      Return requests without clearing the buffer
```

### Responsive testing

```
browse viewport                               Show current viewport size (e.g. 1440x900)
browse viewport 320 568                       Set exact width and height
browse viewport 320x568                       Set exact width and height (alternative format)
browse viewport --device "iPhone SE"          Use a Playwright device profile
browse viewport --preset mobile               375x667
browse viewport --preset tablet               768x1024
browse viewport --preset desktop              1440x900
browse goto <url> --viewport 320x568         Navigate at a specific viewport size
browse goto <url> --device "iPhone SE"       Navigate with a device profile
browse goto <url> --preset mobile            Navigate at mobile viewport
```

The `goto` viewport flags combine navigation with viewport resizing — the viewport is set before the page loads, so the page renders at the correct size from the start.

### JavaScript evaluation

```
browse eval <expression>                      Run JavaScript in the browser page context
browse eval "document.title"                  Returns the page title
browse eval "window.innerWidth"               Check viewport width
browse eval "getComputedStyle(el).color"      Inspect computed styles
browse page-eval <expression>                 Run Playwright page-level operations
browse page-eval "await page.title()"         Access page API with async/await
browse page-eval "page.viewportSize()"        Call any Playwright Page method
```

Use `eval` for in-page DOM/JS queries. Use `page-eval` when you need access to the Playwright `page` object directly. Both return results as strings (objects are JSON-stringified).

### Auth and session

```
browse auth-state save <path>              Export cookies + localStorage to file
browse auth-state load <path>              Restore session from file
browse login --env <name>                  Automated login using configured environment
browse tab list                            Show open tabs with indices
browse tab new [url]                       Open new tab (optionally navigating to URL)
browse tab switch <index>                  Switch to tab by 1-based index
browse tab close [index]                   Close tab by index (defaults to current)
```

### Flows and assertions

```
browse flow list                           List configured flows from browse.config.json
browse flow <name> --var key=value         Execute a named flow with variable substitution
browse assert visible <selector>           Assert element is visible on page
browse assert not-visible <selector>       Assert element is not visible
browse assert text-contains <text>         Assert page body contains text
browse assert text-not-contains <text>     Assert page body does not contain text
browse assert url-contains <substring>     Assert current URL contains substring
browse assert url-pattern <regex>          Assert current URL matches regex
browse assert element-text <sel> <text>    Assert element's text contains string
browse assert element-count <sel> <n>      Assert element count equals n
browse assert permission <name> granted    Check permission via config (navigates to page)
browse assert permission <name> denied     Check permission denial via config
browse healthcheck --var base_url=<url>    Run healthcheck across configured pages
browse wipe                                Clear cookies, storage, buffers, refs, close extra tabs
```

## The ref system

Refs are the primary way to target elements on the page. They replace CSS selectors for most interactions.

- **Always snapshot before interacting.** Refs are assigned by `browse snapshot` and are the only way to target elements.
- **Refs are ephemeral.** They regenerate on every `snapshot` call. Old refs become invalid.
- **Refs go stale after navigation.** Any `goto` or click that triggers navigation invalidates refs. The tool returns a clear error — just run `browse snapshot` again.
- **Ref format:** `@e1`, `@e2`, `@e3`, etc. Assigned sequentially in depth-first order.

**Typical interaction loop:**

```
browse snapshot              # see what's on the page
browse fill @e3 "test"       # fill the search field
browse click @e4             # click a button
browse snapshot              # re-snapshot after the page changes
```

If you see `"Refs are stale"` or `"Unknown ref"`, run `browse snapshot` to refresh.

## QA methodology

Recommended workflow for a QA pass:

1. **Navigate:** `browse goto <url>`.
2. **Observe:** `browse snapshot` to see page structure. `browse screenshot` for visual state.
3. **Check for errors:** `browse console --level error` after every navigation.
4. **Interact:** `browse fill`, `browse click`, `browse select` to exercise forms and flows.
5. **Verify:** `browse snapshot` or `browse screenshot` after each interaction to confirm the expected result.
6. **Repeat:** Move through the application's pages and flows.

For configured applications, use `browse healthcheck` first to get a quick pass/fail across key pages, then drill into failures.

## Authentication

**Preferred — configured login:**

```
browse login --env staging
```

Uses credentials from environment variables defined in `browse.config.json`. Navigates to the login page, fills credentials, submits, and waits for the success condition.

**Manual login:**

```
browse goto https://app.example.com/login
browse snapshot
browse fill @e1 "user@example.com"
browse fill @e2 "password123"
browse click @e3
browse snapshot        # verify redirect / dashboard loaded
```

**Session reuse:**

```
browse auth-state save /tmp/auth.json      # after logging in
browse auth-state load /tmp/auth.json      # in a future session
```

Save auth state after a successful login. Load it in future sessions to skip re-authentication.

**Session cleanup:**

Use `browse wipe` to clear all session data without restarting the daemon:

- After testing with production-like credentials.
- Before switching between user roles/accounts.
- At the end of a QA session.

## Common failure patterns and recovery

| Symptom | Cause | Fix |
|---------|-------|-----|
| `"Refs are stale"` | Page changed since last snapshot | Run `browse snapshot` |
| `"Unknown ref: @e7"` | Ref doesn't exist in current snapshot | Run `browse snapshot` to see available refs |
| `"Daemon connection lost"` | Daemon crashed or was killed | Just run the command again — CLI auto-restarts the daemon and retries once |
| `"Command timed out after Nms"` | Page is slow or unresponsive | Use `--timeout 60000` for slow pages, or check URL/network |
| `"Daemon crashed and recovery failed"` | Daemon restart also failed | Check system resources, try `browse quit` then retry |
| `"Unknown command"` for a valid command | Stale daemon from an older build | Run `browse quit`, then re-run — the fresh binary will cold-start a new daemon |
| `"No element matching selector"` | CSS selector is wrong | Check the selector, use `browse snapshot -f` for full tree |
| `"Unknown flag for '<cmd>'"` | Unrecognised flag passed | Check `browse help <cmd>` for valid flags |
| Login fails | Credentials missing or wrong | Check env vars, verify login URL, use `browse screenshot` to see the page |

## Configuration

The tool is configured via `browse.config.json` in the project root. All sections except `environments` are optional.

```json
{
  "environments": {
    "staging": {
      "loginUrl": "https://staging.example.com/login",
      "userEnvVar": "BROWSE_STAGING_USER",
      "passEnvVar": "BROWSE_STAGING_PASS",
      "usernameField": "input[name=email]",
      "passwordField": "input[name=password]",
      "submitButton": "button[type=submit]",
      "successCondition": { "urlContains": "/dashboard" }
    }
  },
  "flows": {
    "signup": {
      "description": "Test the signup flow",
      "variables": ["base_url", "test_email", "test_pass"],
      "steps": [
        { "goto": "{{base_url}}/register" },
        { "fill": { "input[name=email]": "{{test_email}}" } },
        { "click": "button[type=submit]" },
        { "wait": { "urlContains": "/welcome" } },
        { "screenshot": true },
        { "assert": { "textContains": "Welcome" } }
      ]
    }
  },
  "permissions": {
    "create-user": {
      "page": "{{base_url}}/admin/users",
      "granted": { "visible": "button.create-user" },
      "denied": { "textContains": "Access denied" }
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

See the project documentation for the full configuration schema.
