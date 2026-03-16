# Architecture

## Overview

```
CLI ──JSON──▶ Unix socket ──▶ Daemon ──▶ Playwright ──▶ Chromium
              TCP socket ──┘
```

Browse uses a three-layer architecture: a thin CLI client, a persistent daemon, and Playwright/Chromium. The CLI is a stateless process that serialises a command into JSON and sends it over a Unix socket. The daemon holds the browser open between invocations, amortising the startup cost across many commands.

## The Daemon

- Single-threaded server listening on a Unix socket at `/tmp/browse-daemon.sock`
- Optional TCP transport via `--listen <host>:<port>` for remote agent access
- PID file: `/tmp/browse-daemon.pid`
- Socket permissions: `0o600` (owner-only access)
- Authentication token: `~/.local/state/browse/daemon.token` (0o600, validated on every request)
- Owns one Chromium instance via Playwright (patchright fork)
- Uses a persistent browser context at `~/.bun-browse/user-data`
- Default viewport: 1440x900
- Idle timeout: 30 minutes of inactivity triggers auto-shutdown
- Config resolution: `--config` flag > upward directory search > `~/.browse/config.json` > none
- Headed mode: set `BROWSE_HEADED=1` before the daemon starts to launch visible Chromium

## Cold Start / Warm Start

- **First call:** The CLI spawns the daemon process (`Bun.spawn([process.execPath, "--daemon"])`), then waits for the socket to become available (up to 10s, polling at 100ms). Cold start takes approximately 3s.
- **Subsequent calls:** The CLI connects directly to the existing socket. Warm calls complete in under 30ms.
- **Client-side commands** (version, help) do not start the daemon.

## Socket Authentication

The daemon generates a cryptographically random 256-bit token at startup and writes it to `~/.local/state/browse/daemon.token` with `0o600` permissions. The CLI reads this token file before every request and includes the token in the JSON payload. The daemon validates the token before processing any command.

This prevents other local processes from executing arbitrary commands (including `eval` for JavaScript execution) through the unguarded socket. The token file is cleaned up on daemon shutdown, browser crash, and signal-based termination.

## Signal Handling

The daemon traps `SIGTERM` and `SIGINT` for graceful shutdown. On receiving either signal:

1. Idle timer is cleared
2. Socket server is closed
3. Browser context is closed
4. PID file, socket file, and token file are removed
5. Process exits cleanly

This prevents orphaned files and zombie browser processes in CI environments and during interactive Ctrl-C.

## Request/Response Protocol

The CLI sends a JSON object followed by a newline over the Unix socket:

```json
{"cmd": "goto", "args": ["https://example.com"], "timeout": 30000, "session": "default", "json": false, "token": "<hex>"}
```

The daemon responds with a JSON object followed by a newline:

```json
{"ok": true, "data": "Page title"}
```

or on failure:

```json
{"ok": false, "error": "Error message"}
```

Each connection handles exactly one request: connect, send, receive, close.

## Command Dispatch

- The request is parsed by `parseRequest()` in `protocol.ts`
- Unknown flags are rejected before dispatch via `checkUnknownFlags()`
- Commands are routed through a switch statement in `daemon.ts`
- Timeout-exempt commands: `quit`, `benchmark`, `session`, `ping`, `status`, `trace`, `init`, `screenshots`, `report`, `completions`
- All other commands are wrapped in `withTimeout()` using the config timeout or `--timeout` override

## Session Architecture

- A default session always exists (named "default")
- Sessions share a browser context by default (same cookies, storage)
- The `--isolated` flag creates a new browser context with separate state
- Each session maintains its own: tab registry, dialog state, intercept state, console/network buffers
- Session routing: `--session <name>` on any CLI command resolves to that session's context

## Tab Registry

- Each session maintains a `TabRegistry` containing an array of `TabState` objects
- Each `TabState` holds: page, consoleBuffer (RingBuffer, capacity 500), networkBuffer (RingBuffer, capacity 500), selectedFrameIndex
- An active tab index tracks which tab is current

## Ref System Integration

- Refs are global (not per-session) — stored as module-level state in `refs.ts`
- `markStale()` is called on every `framenavigated` event on the main frame
- `assignRefs()` resets staleness and assigns new refs

## Crash Recovery

- The CLI uses `sendWithRetry()` from `retry.ts`
- On `DAEMON_NOT_RUNNING` or connection error: cleans up stale PID/socket files, spawns a new daemon, and retries
- Retries use exponential backoff: 3 attempts with 1s, 2s, 4s delays
- A circuit breaker trips after 3 consecutive failures, returning an immediate error without attempting recovery (resets on success)
- A browser disconnect event triggers daemon exit and cleanup
- Stale PID detection: checks whether the process is alive via `process.kill(pid, 0)`

## Stealth Mode

Browse uses patchright (a Playwright fork) to reduce automation detection. A random desktop Chrome user-agent matching the host OS is selected via the `user-agents` package.

Patches applied via `addInitScript`:

- `navigator.webdriver` set to `false` (on the prototype to avoid detection)
- `navigator.userAgentData` brands spoofed to match the UA version
- `navigator.userAgent` overridden

Launch arguments include `--disable-blink-features=AutomationControlled` and `--disable-extensions-except` for the screenxy-fix extension.

The **screenxy-fix Chrome extension** patches a CDP mouse coordinate leak in cross-origin iframes (notably Cloudflare Turnstile).

Stealth options are propagated to isolated session contexts.

## Lifecycle

- The PID file is written at startup with mode `0o600`
- The auth token is generated and written to `~/.local/state/browse/daemon.token` with mode `0o600`
- Socket permissions are set to `0o600` after listen
- The idle timer resets on every incoming request. After 30 minutes of inactivity, `shutdown()` is called
- SIGTERM/SIGINT are trapped to allow graceful termination
- Termination sequence: clear idle timer, close server, close browser context, clean up PID file, socket file, and token file

## Performance

Measured with `browse benchmark`:

| Command    | p50  | p95  |
|------------|------|------|
| goto       | 27ms | 32ms |
| snapshot   | 1ms  | 11ms |
| screenshot | 24ms | 25ms |
| click      | 17ms | 18ms |
| fill       | 1ms  | 26ms |

## Key Design Decisions

- **Unix socket over HTTP:** Lower overhead, no port conflicts, OS-level access control.
- **TCP transport option:** Enables remote agents to connect without SSH tunnelling.
- **Persistent daemon:** Amortises browser startup cost across commands.
- **JSON protocol:** Simple, language-agnostic, easy to parse.
- **Module-level ref state:** Simpler than per-session — refs are only meaningful for one page at a time.
- **Ring buffers for console/network:** Bounded memory with FIFO eviction at 500 entries.
- **Exponential backoff + circuit breaker:** Prevents retry storms while allowing recovery from transient failures.

## See Also

- [The Ref System](refs.md)
- [Sessions and Tabs](sessions-and-tabs.md)
