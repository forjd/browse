# Browse CLI Tool — Testing Findings

**Version tested:** 0.8.2 (linux-x64)
**Date:** 2026-03-16
**Test suite:** 711 tests, all passing

**macOS replication:** 2026-03-17, darwin-arm64, Chrome 146.0.7680.80

---

## Summary

Comprehensive testing of all 57 CLI commands revealed **17 bugs** across 5 severity categories. The tool is well-built with good error messages and solid core functionality (navigation, snapshot/ref system, form interactions, accessibility auditing). However, there are several issues in flag parsing, JSON output, daemon lifecycle, and flow variable interpolation that affect usability.

| Severity | Count | macOS confirmed |
|----------|-------|-----------------|
| Critical | 2     | 2               |
| High     | 4     | 3               |
| Medium   | 6     | 3               |
| Low      | 5     | 3               |

### macOS Replication Summary

| # | Finding | macOS Status |
|---|---------|-------------|
| 1 | Global flags before command | **Confirmed** |
| 2 | Flow variable interpolation with spaces | **Confirmed** |
| 3 | `--json` flag not implemented | **Confirmed** |
| 4 | Screenshot visual diff broken | **Confirmed** |
| 5 | Console messages not captured | **Confirmed** |
| 6 | `quit` doesn't shut down daemon | **Confirmed** |
| 7 | `back` command unreliable | Not reproduced — works correctly |
| 8 | Healthcheck fails on console errors | Not reproduced — console capture broken (Finding 5), so healthcheck always shows "Console: clean" |
| 9 | `form` command field matching | Not reproduced — `form` command not registered in CLI |
| 10 | Config validation errors shown as "not found" | **Confirmed** |
| 11 | `press` can silently break page state | **Confirmed** |
| 12 | No-args exits with code 1 | **Confirmed** |
| 13 | `help help` says Unknown command | **Confirmed** |
| 14 | `login --env nonexistent` shows "Available: ." | **Confirmed** |
| 15 | `snapshot -f` identical to `snapshot -i` | **Confirmed** |
| 16 | `forward` with no history returns success | Not reproduced — correctly returns error |
| 17 | `screenshots clean` lacks confirmation | **Confirmed** (design suggestion) |

---

## Critical Issues

### 1. Global flags (`--timeout`, `--session`, `--json`) broken when placed before command

**File:** `src/cli.ts:62`
**Reproduction:**
```bash
browse --timeout 5000 url        # Error: Unknown command: --timeout
browse --session mysession url   # Error: Unknown command: --session
browse --json status             # Error: Unknown command: --json
```

**Expected:** Global flags should work in any position.
**Actual:** Only `--config` and `--listen` are extracted from anywhere in argv. All other global flags are only parsed from args *after* the command name.

**Root cause:** Line 62: `const [cmd, ...rawArgs] = filteredArgv2` unconditionally treats the first non-config/non-listen arg as the command name. The `--timeout`, `--session`, and `--json` flags are only extracted from `rawArgs` (lines 70-88), which comes after the command.

**Impact:** Any user or AI agent that places global flags before the command (a natural CLI convention) will get cryptic errors. The help text advertises these as "Global flags" suggesting they work anywhere.

> **macOS (2026-03-17):** Confirmed. `browse --timeout 5000 ping` → "Error: Unknown command: --timeout". `browse --json status` → "Error: Unknown command: --json".

---

### 2. Flow variable interpolation fails with spaced `{{ var }}` syntax

**File:** `src/flow-runner.ts:47`
**Reproduction:**
```json
{ "goto": "{{ url }}" }
```
```bash
browse flow my-flow --var "url=https://example.com"
# Step navigates to literal "{{ url }}" instead of substituting
```

**Expected:** `{{ url }}` (with spaces) should be interpolated like Mustache/Jinja syntax.
**Actual:** Only `{{url}}` (no spaces) is interpolated.

**Root cause:** The regex `/\{\{(\w+)\}\}/g` requires `{{` immediately followed by word characters then `}}`. Spaces between braces and variable name aren't handled.

**Fix:** Change regex to `/\{\{\s*(\w+)\s*\}\}/g`

**Impact:** Any config file using the common `{{ variable }}` syntax (with spaces) will silently fail to interpolate variables. This is the convention in Mustache, Jinja2, Handlebars, etc.

> **macOS (2026-03-17):** Confirmed. `--dry-run` output shows `{{url}}` resolves to the value but `{{ url }}` stays as the literal string.

---

## High Severity Issues

### 3. `--json` flag not implemented for multiple commands

Several commands advertise `--json` support in their KNOWN_FLAGS but never implement it:

| Command | File | Behavior |
|---------|------|----------|
| `snapshot --json` | `src/commands/snapshot.ts` | Outputs plain text tree, ignores `--json` |
| `console --json` | `src/commands/console.ts` | Outputs plain text, ignores `--json` |
| `network --json` | `src/commands/network.ts` | Outputs plain text, ignores `--json` |
| `cookies --json` | `src/commands/cookies.ts` | Outputs "No cookies." instead of `[]` |
| `storage --json` | `src/commands/storage.ts` | Outputs plain text, ignores `--json` |
| `a11y --json` | `src/commands/a11y.ts` | Outputs plain text, ignores `--json` |

**Impact:** AI agents and CI pipelines relying on structured JSON output will get unparseable plain text instead.

> **macOS (2026-03-17):** Confirmed. `snapshot --json` outputs plain text tree. `cookies --json` outputs "No cookies." (not `[]`). `console --json` and `a11y --json` also output plain text.

---

### 4. Screenshot visual diff broken

**File:** `src/visual-diff.ts`
**Reproduction:**
```bash
browse screenshot /tmp/baseline.png
browse eval "document.body.style.background='lightblue'"
browse screenshot /tmp/current.png --diff /tmp/baseline.png
# Error: Screenshot saved to /tmp/current.png, but diff failed: invalid stored block lengths
```

**Root cause:** The PNG decoder uses `Bun.inflateSync()` on concatenated IDAT chunks. The zlib decompression fails with "invalid stored block lengths" — likely a data handling issue in the custom PNG parser.

**Impact:** The `--diff` feature for visual regression testing is completely non-functional.

> **macOS (2026-03-17):** Confirmed. Same error: "diff failed: invalid stored block lengths".

---

### 5. Console messages from user JavaScript not captured

**Reproduction:**
```bash
browse goto <page-with-buttons>
browse snapshot
browse click @e35   # Button that calls console.log('Log message')
browse click @e36   # Button that calls console.warn('Warning message')
browse click @e37   # Button that calls console.error('Error message')
browse console --keep
# Only shows resource load errors, NOT the user-triggered console messages
```

**Impact:** The `console` command is ineffective for debugging JavaScript behavior triggered by user interactions. Only pre-existing resource errors appear.

> **macOS (2026-03-17):** Confirmed. Clicked buttons with `console.log()`, `console.warn()`, `console.error()` handlers, then `browse console --keep` → "No console messages."

---

### 6. `quit` command doesn't properly shut down daemon

**File:** `src/daemon.ts:671-674`, `src/commands/quit.ts`
**Reproduction:**
```bash
browse quit        # "Daemon stopped."
browse ping        # "pong" — daemon is still alive!
```

Additionally, after eventual shutdown:
- Chrome's `SingletonLock` file at `~/.bun-browse/user-data/SingletonLock` is not cleaned up
- Subsequent daemon starts fail with "Failed to create a ProcessSingleton"
- Requires manual deletion of the lock file

**Root cause:** The quit handler returns immediately, and `shutdown()` is scheduled via `setTimeout(..., 50)` which may be too short or may not execute properly.

> **macOS (2026-03-17):** Confirmed. `browse quit` → "Daemon stopped." then `browse ping` → "pong". SingletonLock issue not tested.

---

## Medium Severity Issues

### 7. `back` command unreliable / history polluted by benchmark

**Reproduction:**
```bash
browse goto "page1.html"
browse goto "page2.html"
browse back
# Error: No previous page in history
# OR: Navigates to data:text/html benchmark page instead
```

**Root cause:** The `benchmark` command creates `data:text/html` pages in the same session, polluting the navigation history stack.

> **macOS (2026-03-17):** Not reproduced. `goto page1 → goto page2 → back` navigated correctly to page1. The benchmark pollution scenario was not tested.

---

### 8. Healthcheck fails on console errors even when all assertions pass

**Reproduction:**
```bash
browse healthcheck
# "Healthcheck: 0/1 pages passed"
# "Assertions: 1/1 passed"
# "Console errors: [ERROR] Failed to load resource..."
```

A page with all assertions passing is marked as FAILED because of unrelated resource console errors (e.g., a missing favicon). This makes healthchecks overly fragile.

**Suggestion:** Console errors should be warnings, not failure conditions, unless explicitly configured.

> **macOS (2026-03-17):** Not reproduced. Because console messages from user JS are not captured at all (Finding 5), the healthcheck always reports "Console: clean" — even on pages with `console.error()` and `throw new Error()`. The original finding may have involved network-level resource errors captured differently on Linux.

---

### 9. `form` command field matching is fragile

**Reproduction:**
```bash
browse form --data '{"Username:":"testuser"}'
# Error: ✗ Username:: no matching form field found
browse form --data '{"username":"testuser"}'
# Success: ✓ username: "testuser" (textbox)
```

The form command only matches by input `name` attribute, not by label text, placeholder, or accessible name. The field matching mechanism doesn't align with how users typically describe form fields.

> **macOS (2026-03-17):** Not reproduced. The `form` command is not registered in the CLI command list — `browse form` returns "Error: Unknown command: form". The command exists in `src/commands/form.ts` and is handled by the daemon (`daemon.ts:639`) but is not exposed to users.

---

### 10. Config validation errors shown as "not found"

**Reproduction:** Create a `browse.config.json` with invalid flow steps (e.g., `{ "assert": "text-contains foo" }` instead of `{ "assert": { "textContains": "foo" } }`).

```bash
browse flow list
# Error: No browse.config.json found. Create one with flow definitions.
```

The config file IS found, but validation fails. The error message is misleading — it should say "Config found but invalid" with details about what's wrong.

> **macOS (2026-03-17):** Confirmed. A config with only `flows` (missing required `environments` object) causes validation to fail. The daemon logs a warning at stderr (e.g. "Warning: Invalid browse.config.json: missing 'environments' object.") but the client receives "No browse.config.json found." Similarly, invalid assertion keys cause validation failure with the same misleading "not found" message.

---

### 11. `press` command can silently break page state

Pressing Enter or other keys can trigger form submissions or navigation, which silently invalidates refs without notification. The next command using a ref fails with "Refs are stale" but the user doesn't know why.

**Suggestion:** Detect navigation after `press` and include a warning in the response.

> **macOS (2026-03-17):** Confirmed. `browse press Enter` on a form with `action="https://example.com/submit"` navigated to the new page. The response only says "Pressed Enter" with no mention of the navigation. Old snapshot refs silently became stale.

---

### 12. No-args invocation exits with code 1

```bash
browse
# Shows help text
# Exit code: 1
```

Running with no arguments should arguably exit 0 since displaying help is a valid action. Many CLI tools (git, docker) exit 0 when showing help.

> **macOS (2026-03-17):** Confirmed. Shows help text, exit code 1.

---

## Low Severity Issues

### 13. `help help` says "Unknown command"

```bash
browse help help
# "Unknown command: help"
```

The `help` command is handled client-side but not registered in the COMMANDS map in `help.ts`, so `formatCommandHelp("help")` returns null.

> **macOS (2026-03-17):** Confirmed. `browse help help` → "Unknown command: help".

---

### 14. `login --env nonexistent` shows "Available: ."

```bash
browse login --env nonexistent
# "Unknown environment: 'nonexistent'. Available: ."
```

When no environments are configured, the available list is empty and joins as an empty string followed by a period, producing "Available: .". Should show "Available: (none)" or similar.

> **macOS (2026-03-17):** Confirmed. With empty `environments: {}` in config, `browse login --env nonexistent` → "Unknown environment: 'nonexistent'. Available: ."

---

### 15. `snapshot -f` output identical to `snapshot -i`

In testing, the "full" mode (`-f`) produced the same output as the "inclusive" mode (`-i`). The distinction between these modes is unclear from the output.

> **macOS (2026-03-17):** Confirmed. `diff` of `snapshot -f` and `snapshot -i` outputs shows zero differences.

---

### 16. `forward` with no forward history returns success

On a fresh page with no navigation history:
```bash
browse forward
# "Browse CLI Test Page" (success, exit 0)
```

`back` correctly returns an error, but `forward` silently succeeds and returns the current page title.

**Update:** On subsequent tests this was inconsistent — sometimes it correctly returned an error.

> **macOS (2026-03-17):** Not reproduced. After `browse wipe && browse goto <page>`, `browse forward` correctly returns "Error: No next page in history" with exit code 1.

---

### 17. `screenshots clean` not tested but lacks confirmation

The `screenshots clean --older-than 1h` command could delete screenshots without confirmation. A `--dry-run` flag or confirmation prompt would be safer.

> **macOS (2026-03-17):** Confirmed. `browse help screenshots` shows no `--dry-run` flag or confirmation mechanism.

---

## What Works Well

- **Core navigation** (goto, url, title, text, back) — solid and fast
- **Snapshot/ref system** — excellent element targeting mechanism, clear error messages for stale refs
- **Form interactions** (click, fill, select, checkbox, radio) — all work correctly
- **Assertions** — comprehensive types with clear PASS/FAIL output
- **Wait commands** — all variants work correctly with proper timeout handling
- **Tab management** — create, switch, close, list all work with good error messages
- **Viewport control** — presets, custom sizes, device emulation
- **Session management** — isolated and shared sessions work correctly
- **Accessibility audit** — axe-core integration produces useful violation reports
- **Trace recording** — start/stop/status works correctly
- **Flow execution** — step-by-step output, dry-run, streaming all work (when variables don't have spaces)
- **Benchmark** — clear latency statistics with percentiles
- **Error messages** — consistently helpful with usage hints
- **Performance** — sub-200ms for most commands after cold start
- **Test suite** — 711 tests, all passing

---

## Test Environment

### Original (2026-03-16)
- Platform: Linux x86_64
- Bun: 1.3.9
- Browser: Chromium 141.0.7390.37
- Binary: compiled via `bun build --compile`

### macOS Replication (2026-03-17)
- Platform: Darwin arm64 (macOS 25.2.0)
- Browser: Chrome 146.0.7680.80
- Binary: compiled via `bun build --compile` (Mach-O arm64)
