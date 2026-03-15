# Browse CLI — Project Roadmap

**A custom Playwright CLI tool for AI-agent-driven QA automation**

Built in TypeScript, compiled with Bun.

---

## Why build this

AI coding agents can write and refactor code, but they cannot verify their own output visually. Every time a change lands on staging, someone has to manually open a browser, log in, click through flows, and confirm nothing is broken. For applications with complex permissions, multi-step workflows, and role-based access, that manual loop is a bottleneck.

This tool gives the agent eyes. It can navigate your application, authenticate, verify UI behaviour, check compliance screens, test user flows, and screenshot the results — all from the terminal, all within the same agentic loop that wrote the code.

---

## Technical decisions

**Language:** TypeScript, compiled to a single binary via `bun build --compile`.

**Rationale:**
- Playwright's first-class bindings are Node.js — no serialisation boundary between the CLI and browser control logic.
- Bun's single-binary compilation eliminates the "install Node, install deps" friction for teammates.
- A Rust or Go CLI shell adds a second language for negligible performance gain — the bottleneck is always the browser action, not command parsing.

**Architecture:** Persistent daemon model.
- A long-running Bun process owns a Playwright Chromium instance and listens on a Unix socket.
- The CLI binary connects to the socket, sends a JSON command, prints the response.
- First call cold-starts the daemon (~3s). Every subsequent call targets sub-200ms.
- Session state (cookies, localStorage, auth tokens) persists across commands.

---

## Phase 0 — Foundation

**Goal:** A working daemon + CLI that can navigate to a URL and return page text.

### Daemon (`server.ts`)

- Launch Playwright Chromium in persistent context mode.
- Listen on Unix socket at `/tmp/browse-daemon.sock`.
- Accept JSON commands over the socket: `{ "cmd": "goto", "args": ["https://..."] }`.
- Return JSON responses: `{ "ok": true, "data": "..." }` or `{ "ok": false, "error": "..." }`.
- Implement initial commands: `goto`, `text`, `quit`.

### CLI (`cli.ts`)

- Parse positional args: `browse goto https://staging.example.com`.
- Connect to Unix socket. If connection refused, spawn daemon as background process, wait for socket, retry.
- Print response to stdout (plain text, not JSON — the agent reads stdout).
- Handle `browse quit` to shut down the daemon gracefully.

### Lifecycle

- PID file at `/tmp/browse-daemon.pid` to prevent duplicate daemons.
- Idle timeout: kill daemon after 30 minutes of no commands.
- Signal handling: clean up socket and PID file on SIGTERM/SIGINT.

### Compilation

- `bun build --compile ./src/cli.ts --outfile dist/browse`
- Verify the binary runs standalone without Bun installed.

### Deliverable

`browse goto https://example.com` returns the page title. `browse text` returns visible text content. `browse quit` shuts everything down.

---

## Phase 1 — Snapshot and Ref System

**Goal:** The agent can see page structure and target elements by ref.

### Snapshot command

- Call `page.accessibility.snapshot()` to get the accessibility tree.
- Walk the tree recursively. Assign each interactive element (buttons, links, inputs, selects) a sequential ref: `@e1`, `@e2`, `@e3`.
- Store the ref-to-locator mapping in memory on the daemon side.
- Return a compact text representation to stdout, e.g.:
  ```
  @e1 [link] "Dashboard"
  @e2 [link] "Users"
  @e3 [input] "Search..." (placeholder)
  @e4 [button] "Create New"
  @e5 [select] "Role"
  ```

### Interaction commands using refs

- `browse click @e4` — resolve ref, click the element.
- `browse fill @e3 "search term"` — resolve ref, clear field, type value.
- `browse select @e5 "Admin"` — resolve ref, select option by visible text.

### Snapshot flags

- `browse snapshot` — interactive elements only (default, compact).
- `browse snapshot -i` — include non-interactive elements (headings, text blocks) for fuller context.
- `browse snapshot -f` — full tree dump for debugging.

### Ref lifecycle

- Refs are regenerated on every `snapshot` call.
- Stale ref usage (calling `click @e4` after a page navigation without re-snapshotting) returns a clear error: `"Ref @e4 is stale. Run 'browse snapshot' to refresh."`.

### Deliverable

The agent can snapshot a page, identify form fields by ref, fill them in, click buttons, and interact with dropdowns — all without CSS selectors.

---

## Phase 2 — Screenshot and Console

**Goal:** The agent can see rendered output and catch JS errors.

### Screenshot command

- `browse screenshot /tmp/page-detail.png` — full-page screenshot saved to path.
- `browse screenshot /tmp/header.png --selector ".app-header"` — element-level screenshot.
- `browse screenshot /tmp/above-fold.png --viewport` — viewport only (no scroll).
- Output the file path to stdout so the agent can read it back via its image tooling.

### Console command

- `browse console` — return all console messages since last `console` call (or since page load).
- `browse console --level error` — filter to errors only.
- `browse console --clear` — clear the buffer.
- Format: `[ERROR] Uncaught TypeError: Cannot read properties of undefined (reading 'userId') at UserDetail.vue:47`.

### Network command (stretch)

- `browse network` — return failed requests (4xx, 5xx) since last check.
- Useful for catching broken API calls that don't surface as console errors.

### Deliverable

The agent can screenshot any page or element, check for JS errors, and catch failed network requests. Combined with Phase 1, this is enough for basic QA passes.

---

## Phase 3 — Auth and Multi-Tab

**Goal:** The agent can log into the application and manage multiple pages.

### Auth support

- `browse auth-state save /tmp/auth.json` — export cookies + localStorage to file.
- `browse auth-state load /tmp/auth.json` — restore session from file.
- This lets the agent (or a human) log in once, save the state, and reuse it across sessions without re-authenticating every time.

### Login helper

- `browse login --env staging` — navigate to the login page, fill credentials from a `.env` file or environment variables (`BROWSE_STAGING_USER`, `BROWSE_STAGING_PASS`), submit, wait for redirect, confirm auth succeeded.
- Configurable via a `browse.config.json` that defines login URLs, credential env var names, and success conditions per environment.
- This is a convenience wrapper. The agent can always do this manually with `goto` + `fill` + `click`, but a single command reduces token cost for the most common action.

### Tab management

- `browse tab list` — show open tabs with indices.
- `browse tab new https://...` — open URL in new tab.
- `browse tab switch 2` — switch to tab by index.
- `browse tab close 2` — close tab by index.
- All commands operate on the active tab by default.

### Deliverable

The agent can authenticate against any environment, persist auth state for reuse, and work across multiple tabs (e.g., comparing two role-specific views side by side).

---

## Phase 4 — Domain-Specific Commands

**Goal:** Bake in application-specific awareness so the agent can do higher-level QA with fewer tool calls.

These commands are opinionated shortcuts that encode knowledge of your application's UI patterns. Each one replaces 3–8 individual browse commands. They are defined in `browse.config.json` alongside the core tool, making them portable across projects.

### Configurable flows

Define named flows in config that the CLI can execute as single commands:

```json
{
  "flows": {
    "healthcheck": {
      "steps": [
        { "goto": "{{base_url}}/api/health", "assert": "status ok" },
        { "goto": "{{base_url}}/dashboard", "screenshot": true, "console": "error" },
        { "goto": "{{base_url}}/settings", "screenshot": true, "console": "error" }
      ]
    },
    "signup": {
      "steps": [
        { "goto": "{{base_url}}/register" },
        { "fill": { "email": "{{test_email}}", "password": "{{test_pass}}" } },
        { "click": "Submit" },
        { "wait": "redirect", "screenshot": true }
      ]
    }
  }
}
```

- `browse flow healthcheck --base_url https://staging.example.com` — run the named flow, return a pass/fail summary with screenshots.
- `browse flow signup --base_url https://staging.example.com --test_email test@example.com --test_pass secret` — run the signup flow with injected variables.

### Permission assertions

- `browse assert-permission granted "Create User"` — attempt an action, verify it succeeds.
- `browse assert-permission denied "Delete User"` — attempt an action, verify the permission-denied response renders correctly.
- Action-to-UI mappings defined in config so the tool knows which page and element corresponds to each permission.

### Health check

- `browse healthcheck <base-url>` — hit the health endpoint, then navigate to a configurable list of key pages, screenshot each, check console for errors, return a pass/fail summary.
- Designed to run after every deployment to staging.

### Deliverable

The agent can run high-level QA commands that understand the application's structure, reducing both token cost and the chance of the agent getting lost in a complex multi-step flow.

---

## Phase 5 — Skill File and Integration

**Goal:** Claude Code can use the tool effectively via a SKILL.md file.

### SKILL.md

Write the skill file that ships alongside the binary. This tells Claude Code:

- What commands exist and their exact syntax.
- How the ref system works (snapshot first, then interact).
- How to interpret screenshot output (read the file path, use image tooling).
- When to check console errors (after every navigation).
- How to authenticate (use `browse login --env staging` or manual flow).
- The QA methodology: navigate, snapshot, interact, screenshot, check console, move on.
- Domain-specific commands and when to use them.
- Common failure patterns and how to recover (stale refs, daemon not running, auth expired).

### CLAUDE.md integration

Add a section to the project's CLAUDE.md that registers the skill, tells Claude to prefer it over any MCP browser tools, and provides the path to the binary.

### Setup script

- `./setup` — installs Playwright browsers, compiles the binary, creates symlinks.
- Idempotent. Safe to run repeatedly.
- Detects platform (macOS/Linux, x64/arm64) and compiles accordingly.

### Deliverable

Any developer on the team can clone the repo, run `./setup`, and immediately use `/browse` in Claude Code. The agent knows how to do a full QA pass on staging without additional prompting.

---

## Phase 6 — Hardening

**Goal:** Production-grade reliability.

### Error handling

- Graceful recovery from browser crashes (detect, restart daemon, retry command).
- Timeout per command (default 30s, configurable) with clear error messages.
- Socket connection retry with exponential backoff.

### Testing

- Unit tests for ref assignment logic (deterministic ordering, correct element filtering).
- Integration tests that spin up a local test server, run a sequence of browse commands, and verify output.
- CI pipeline that compiles the binary and runs tests on both macOS and Linux.

### Performance

- Benchmark command latency. Target: p95 under 200ms for non-screenshot commands.
- Profile memory usage of long-running daemon sessions.
- Verify no memory leaks from accumulated ref maps (clear on each snapshot).

### Security

- Document that the daemon holds real browser state (cookies, tokens).
- Add `browse wipe` command to clear all session data without killing the daemon.
- Ensure the Unix socket has restrictive permissions (owner-only).
- Never log credentials to stdout.

### Deliverable

The tool is reliable enough to run in CI for post-deployment smoke tests, not just interactive use.

---

## Future considerations (not scheduled)

- **Headed mode** — `browse --headed` to launch visible Chromium for debugging. Useful when the agent's QA report says something is broken and a human wants to see it.
- **Video recording** — record a session as MP4 for async review. Playwright supports this natively.
- **Parallel sessions** — multiple daemon instances for testing different user roles simultaneously.
- **Firefox/WebKit** — Playwright supports them, but Chromium-only is fine for internal QA.
- **Diff screenshots** — compare screenshots between branches or deployments, flag visual regressions.
- **Report generation** — `browse report` that compiles all screenshots and findings from a session into a single HTML or PDF document.

---

## Dependencies

| Dependency | Purpose | Version |
|---|---|---|
| Bun | Runtime + single-binary compilation | >= 1.0 |
| Playwright | Browser automation | Latest |
| Chromium | Headless browser (installed via Playwright) | Bundled |

No other runtime dependencies. The compiled binary is self-contained.

---

## Phase summary

| Phase | Scope |
|---|---|
| 0 | Foundation — daemon + CLI + basic navigation |
| 1 | Snapshot and ref system |
| 2 | Screenshot and console |
| 3 | Auth and multi-tab |
| 4 | Domain-specific commands |
| 5 | Skill file and integration |
| 6 | Hardening |

Phases 0–2 deliver a usable tool. Phases 3–4 make it powerful. Phases 5–6 make it team-ready.
