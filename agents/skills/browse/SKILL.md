---
name: browse
description: "Browser automation CLI for AI agents. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, or automating any browser task. Triggers include: any mention of 'browse', 'check the page', 'take a screenshot', 'test the UI', 'fill the form', 'click the button', 'QA', 'visual check', 'healthcheck', and any task requiring a real browser."
allowed-tools: Bash(browse:*)
---

# Browse — Browser Automation for Agents

## How it works

`browse` is a CLI that wraps Playwright behind a persistent daemon on a Unix socket. The daemon cold-starts in ~3s on first use, then every command runs in sub-200ms. Session state (cookies, localStorage, auth tokens) persists across commands within a session.

All output is plain text. Objects are JSON-stringified. Commands return non-zero on failure with an error message.

**Important constraints:**
- Commands are sequential — do not run multiple `browse` commands in parallel. The daemon handles one command at a time.
- Run `browse help` for the full command list, or `browse help <command>` for detailed usage and flags.

## The ref system — read this first

Refs (`@e1`, `@e2`, ...) are how you target elements. They replace CSS selectors for most interactions.

**Rules:**
1. **Always `browse snapshot` before interacting.** Refs only exist after a snapshot.
2. **Refs are ephemeral.** Every `snapshot` call regenerates them. Old refs are invalid.
3. **Refs go stale after navigation.** Any `goto` or click that changes the page invalidates refs. You'll get a clear error — just `browse snapshot` again.

**Core interaction loop:**

```
browse snapshot              # see what's on the page — get refs
browse fill @e3 "test"       # fill the search field
browse click @e4             # click a button
browse snapshot              # re-snapshot after the page changes
```

## Workflow

The standard pattern for any browser task:

1. **Navigate:** `browse goto <url>`
2. **Observe:** `browse snapshot` for page structure (interactive elements with refs). Use `browse snapshot -i` to include structural elements (headings, text), or `-f` for the full accessibility tree.
3. **Check for errors:** `browse console --level error` after navigation.
4. **Interact:** `browse fill @eN "value"`, `browse click @eN`, `browse hover @eN`, `browse press Tab`, `browse select @eN "option"`, `browse scroll @eN` (scroll into view).
   - Use `browse press <key>` for keyboard navigation (Tab, Escape, Enter, ArrowDown, Shift+Tab, etc.). Multiple keys: `browse press Tab Tab Tab`.
   - Use `browse scroll down/up` to page through content, `browse scroll top/bottom` to jump to extremes.
   - After clicks that trigger SPA navigation, use `browse wait url /path`, `browse wait text "Expected"`, or `browse wait visible .selector` before snapshotting.
5. **Verify:** `browse snapshot` or `browse screenshot` after each interaction to confirm the result.
6. **Repeat:** Move through pages and flows.

For configured applications, `browse healthcheck` gives a quick pass/fail across key pages.

## Key commands by category

| Category | Commands |
|----------|----------|
| **Navigate** | `goto <url>`, `url`, `back`, `forward`, `reload [--hard]`, `text`, `version`, `quit`, `wipe` |
| **Observe** | `snapshot`, `screenshot` (`--diff`, `--threshold`), `console`, `network` |
| **Interact** | `click @eN`, `hover @eN [--duration ms]`, `press <key> [key ...]`, `fill @eN "value"`, `select @eN "option"`, `upload @eN <file> [file ...]`, `attr @eN [attribute]`, `scroll down/up/top/bottom/@eN/x y`, `form --data '{"field":"value"}'` |
| **Wait** | `wait url <str>`, `wait text <str>`, `wait visible <sel>`, `wait hidden <sel>`, `wait network-idle`, `wait <ms>` |
| **Viewport** | `viewport`, `goto --viewport/--device/--preset` |
| **Evaluate** | `eval <expr>` (in-page JS), `page-eval <expr>` (Playwright page API) |
| **Auth** | `login --env <name>`, `auth-state save/load <path>` |
| **Tabs** | `tab list/new/switch/close` |
| **Assert** | `assert visible/text-contains/url-contains/...`, `assert-ai "<visual assertion>"` |
| **Accessibility** | `a11y` (full page), `a11y @eN` (element), `a11y --standard wcag2aa`, `a11y --json`, `a11y coverage`, `a11y tree`, `a11y tab-order`, `a11y headings` |
| **Performance** | `perf` (Core Web Vitals), `perf --budget lcp=2500,cls=0.1`, `perf --json` |
| **Security** | `security` (headers, cookies, mixed content), `security --json` |
| **Responsive** | `responsive` (multi-viewport screenshots), `responsive --breakpoints 320x568,1920x1080`, `responsive --url <url>` |
| **Extract** | `extract table <sel>` (`--csv`, `--json`), `extract links` (`--filter`), `extract meta`, `extract select <sel>` (`--attr`) |
| **Flows** | `flow list`, `flow <name> --var key=value` (`--reporter junit\|json\|markdown`, `--dry-run`, `--stream`, `--webhook <url>`), `healthcheck` (`--reporter junit\|json\|markdown`, `--parallel`, `--concurrency`, `--webhook <url>`), `test-matrix --roles r1,r2 --flow <name>`, `diff --baseline <url> --current <url>`. Flows can be defined inline in config or as individual JSON files in a `flows/` directory. |
| **Sessions** | `session list/create/close`, `--session <name>` on any command |
| **Tracing** | `trace start` (`--screenshots`, `--snapshots`), `trace stop --out <path>`, `trace view [<path>] --latest --port <n>`, `trace list`, `trace status` |
| **Video** | `video start [--size WxH]`, `video stop [--out <path>]`, `video status`, `video list` |
| **Crawl** | `crawl <url>` (`--depth`, `--extract table\|links\|meta\|text`, `--paginate`, `--rate-limit`, `--output`, `--dry-run`) |
| **Record** | `record start` (`--output`, `--name`), `record stop`, `record pause/resume` |
| **Network Sim** | `throttle <preset\|off\|status>` (slow-3g, 3g, 4g, wifi, cable), `offline on/off` |
| **NL Commands** | `do "<instruction>"` (`--dry-run`, `--provider`, `--model`) |
| **VRT** | `vrt init`, `vrt baseline`, `vrt check` (`--threshold`), `vrt update` (`--all`), `vrt list` |
| **SEO** | `seo [url]` (`--check`, `--score`, `--json`) |
| **Compliance** | `compliance [url]` (`--standard gdpr\|ccpa\|eprivacy`, `--json`) |
| **Security Scan** | `security-scan` (`--checks xss,csp,clickjack,forms`, `--verbose`, `--json`) |
| **i18n** | `i18n --locales en,fr,de --url <url>`, `i18n check-keys`, `i18n rtl-check` |
| **API Assert** | `api-assert <url-pattern>` (`--status`, `--timing`, `--schema`, `--body-contains`, `--header`) |
| **Design** | `design-audit --tokens <file>`, `design-audit --extract` |
| **Doc Capture** | `doc-capture --flow <file> --output <dir>` (`--markdown`, `--update`) |
| **Gestures** | `gesture swipe <dir>`, `gesture long-press @eN`, `gesture double-tap @eN`, `gesture drag @eN --to @eN` |
| **Devices** | `devices list`, `devices search <query>`, `devices info <name>` |
| **Monitor** | `monitor check --config <file>`, `monitor history`, `monitor status` |
| **Dev Server** | `dev start`, `dev stop`, `dev status` |
| **CI/CD** | `ci-init` (`--ci github\|gitlab\|circleci`) |
| **Events** | `subscribe` (`--events navigation,console,network`, `--level`, `--idle-timeout`) |
| **Watch/REPL** | `watch <flow-file>`, `repl` |
| **Tooling** | `init`, `report --out <path>`, `replay --out <path>`, `flow-share export/import/list/install/publish`, `screenshots list/clean/count`, `completions bash/zsh/fish`, `status [--json] [--watch] [--exit-code] [--metrics]` |
| **Plugins** | Custom commands via plugins — see the `browse-plugins` skill. Plugin commands appear in `browse help` output |

Run `browse help <command>` for flags and detailed usage — don't guess at flags.

### Observability quick notes

- Use `browse status --metrics` when CI or monitoring expects Prometheus-style output.
- Use `browse status --json` for structured health + daemon metadata in automation.
- Optional daemon env knobs:
  - `BROWSE_LOG_FORMAT=json` and `BROWSE_LOG_LEVEL=debug|info|warn|error`
  - `BROWSE_MAX_RSS_MB=<limit>`
  - `BROWSE_SLOW_COMMAND_MS=<ms>`

### Named sessions

Use named sessions to run multiple independent page groups:

```sh
browse session create worker-1               # shared context (same cookies/storage)
browse session create worker-2 --isolated    # isolated context (separate cookies/storage)
browse --session worker-1 goto https://a.com
browse --session worker-2 goto https://b.com
browse session list
browse session close worker-1
```

By default, sessions share the browser context. Use `--isolated` for fully separate cookies, storage, and permissions.

## Authentication

**Configured login** (preferred — uses `browse.config.json`):

```
browse login --env staging
```

**Manual login:**

```
browse goto https://app.example.com/login
browse snapshot
browse fill @e1 "user@example.com"
browse fill @e2 "password123"
browse click @e3
browse snapshot        # verify redirect / dashboard loaded
```

**Session reuse** — save after login, load in future sessions:

```
browse auth-state save /tmp/auth.json
browse auth-state load /tmp/auth.json
```

Use `browse wipe` to clear all session data before switching accounts or at the end of a session.

## Visual diff

Compare screenshots against a baseline to detect visual regressions:

```bash
browse screenshot current.png --diff baseline.png
browse screenshot current.png --diff baseline.png --threshold 5
```

Output includes similarity percentage, diff pixel count, and a path to the diff image (changed pixels highlighted in red).

## Multi-browser

Browse defaults to Chromium. Use `--browser` to switch:

```bash
browse --browser firefox goto https://example.com
browse --browser webkit goto https://example.com
BROWSE_BROWSER=firefox browse goto https://example.com
```

Stealth features and CDP console capture are Chromium-only; Firefox/WebKit use standard Playwright.

## Proxy

Route browser traffic through a proxy:

```bash
browse --proxy http://proxy:8080 goto https://example.com
BROWSE_PROXY=socks5://proxy:1080 browse goto https://example.com
```

Or configure in `browse.config.json` with `"proxy": { "server": "http://proxy:8080", "bypass": "localhost", "username": "u", "password": "p" }`.

## Playwright passthrough

Pass any Playwright launch or context option via `browse.config.json` without waiting for explicit `browse` support:

```json
{
  "playwright": {
    "launchOptions": { "locale": "fr-FR", "timezoneId": "Europe/Paris" },
    "contextOptions": { "colorScheme": "dark", "geolocation": { "latitude": 48.86, "longitude": 2.35 } }
  }
}
```

`launchOptions` are applied at browser startup; `contextOptions` are applied to isolated sessions and video recording contexts. Browse's own options (headless, viewport, stealth) take precedence on conflict.

## Headed mode

Launch the browser visibly for debugging (set before the daemon starts):

```bash
BROWSE_HEADED=1 browse goto https://example.com
```

## Timeout control

Any command accepts `--timeout <ms>` (default 30s). Use for slow pages:

```
browse goto https://slow-page.example.com --timeout 60000
```

## Error recovery

| Error | Fix |
|-------|-----|
| `"element is outside of the viewport"` | Run `browse scroll @eN` to scroll it into view, then retry |
| `"Refs are stale"` / `"Unknown ref"` | Run `browse snapshot` to refresh refs |
| `"Daemon connection lost"` | Re-run the command — CLI auto-restarts the daemon |
| `"Command timed out after Nms"` | Use `--timeout 60000`, or check the URL |
| `"Daemon crashed and recovery failed"` | Run `browse quit`, then retry |
| `"Unknown command"` for a valid command | Stale daemon — run `browse quit`, then retry |
| `"Unknown flag"` | Check `browse help <cmd>` for valid flags |
| Login fails | Check env vars, verify login URL, `browse screenshot` to see the page |
