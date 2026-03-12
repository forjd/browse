# Phase 0 — Foundation

**Goal:** A working daemon + CLI that can navigate to a URL and return page text.

---

## File Structure

```
src/
  cli.ts          # CLI entry point — parses args, connects to daemon
  daemon.ts       # Daemon entry point — launches browser, listens on socket
  commands/
    goto.ts       # Navigate to URL, return page title
    text.ts       # Return visible text content of current page
    quit.ts       # Shut down daemon gracefully
  protocol.ts     # Shared types for request/response JSON protocol
  socket.ts       # Socket client helpers (connect, send, receive)
  lifecycle.ts    # PID file, idle timeout, signal handling
```

---

## Protocol

All communication between CLI and daemon is newline-delimited JSON over a Unix socket.

### Request

```ts
type Request = {
  cmd: "goto" | "text" | "quit";
  args: string[];
};
```

### Response

```ts
type Response =
  | { ok: true; data: string }
  | { ok: false; error: string };
```

One request per connection. The CLI opens a socket, writes the JSON request followed by a newline, reads the full response, then closes. This avoids any need for multiplexing or connection pooling.

---

## Daemon (`daemon.ts`)

### Startup

1. Check for existing PID file at `/tmp/browse-daemon.pid`. If present and the process is alive, exit with error.
2. Write own PID to `/tmp/browse-daemon.pid`.
3. Launch Playwright Chromium via `chromium.launchPersistentContext()` with a user data directory at `~/.bun-browse/user-data/`. Persistent context preserves cookies and localStorage across daemon restarts.
4. Open one default page (tab).
5. Listen on Unix socket at `/tmp/browse-daemon.sock`.
6. Start idle timer (30 minutes).

### Connection handling

- On each connection: read the full request (buffer until newline), parse JSON, dispatch to the matching command handler, write JSON response, close the connection.
- Reset idle timer on every command.
- If the command is unknown, return `{ ok: false, error: "Unknown command: foo" }`.

### Idle timeout

- If no commands are received for 30 minutes, the daemon shuts itself down (closes browser, removes socket and PID file, exits).
- The timer resets on every incoming command.

### Signal handling

- On `SIGTERM` and `SIGINT`: close browser, remove `/tmp/browse-daemon.sock` and `/tmp/browse-daemon.pid`, exit cleanly.

### Error boundaries

- If Playwright throws during a command, catch the error and return `{ ok: false, error: message }`. The daemon stays alive.
- If the browser process itself crashes, exit the daemon (let the CLI cold-start a fresh one on next invocation).

---

## Commands

### `goto <url>`

1. Validate that `args[0]` is present. If missing, return error.
2. Call `page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })`.
3. Return `{ ok: true, data: page.title() }` (the page title serves as confirmation).

### `text`

1. Call `page.innerText("body")` to get all visible text.
2. Truncate to 50,000 characters if necessary (prevents unbounded output).
3. Return `{ ok: true, data: text }`.

### `quit`

1. Close browser context and browser.
2. Remove socket file and PID file.
3. Write `{ ok: true, data: "Daemon stopped." }` to the connection.
4. Exit the process.

---

## CLI (`cli.ts`)

### Argument parsing

Positional args only, no flag library needed:

```
browse <command> [args...]
browse goto https://example.com
browse text
browse quit
```

`process.argv` after stripping the binary name gives `[command, ...args]`.

### Daemon connection flow

1. Attempt to connect to `/tmp/browse-daemon.sock`.
2. **If connection succeeds:** send request, read response, print to stdout, exit.
3. **If connection refused (daemon not running):**
   a. Spawn daemon as a detached background process: `Bun.spawn(["bun", "run", "src/daemon.ts"], { detached: true, stdio: "ignore" })`.
   b. Poll the socket (100ms intervals, up to 10 seconds) until it accepts connections.
   c. If timeout, print error and exit with code 1.
   d. Once connected, send request as normal.

### Output formatting

- On success: print `response.data` to stdout (plain text, no JSON wrapper).
- On error: print `Error: ${response.error}` to stderr, exit with code 1.

### Edge cases

- `browse` with no arguments: print usage string to stderr, exit 1.
- Connection drops mid-read: print `Error: Daemon connection lost.` to stderr, exit 1.

---

## Lifecycle Management (`lifecycle.ts`)

### PID file

- Path: `/tmp/browse-daemon.pid`.
- Written on daemon startup, removed on clean shutdown.
- On startup, if the file exists, check if the PID is alive (`process.kill(pid, 0)`). If alive, refuse to start. If stale (process dead), overwrite.

### Socket file

- Path: `/tmp/browse-daemon.sock`.
- If the file exists at startup but no process is listening, remove it before binding.

### Idle timeout

- 30-minute `setTimeout`, reset on each command.
- On expiry, run the same shutdown sequence as `quit`.

---

## Compilation

The CLI is compiled to a standalone binary:

```bash
bun build --compile ./src/cli.ts --outfile dist/browse
```

**Key constraint:** The compiled binary cannot `Bun.spawn(["bun", "run", "src/daemon.ts"])` because `bun` and `src/daemon.ts` won't exist on the target machine. Two options:

### Option A — Single binary, daemon inside (recommended)

The CLI binary contains both roles. When invoked with an internal flag `--daemon`, it runs the daemon loop instead of the CLI flow:

```
dist/browse goto https://...     → CLI mode
dist/browse --daemon             → daemon mode (spawned by CLI)
```

On cold-start, the CLI spawns itself as a background process:
```ts
Bun.spawn([process.execPath, "--daemon"], { detached: true, stdio: "ignore" });
```

This keeps it a single binary with no runtime dependencies.

### Option B — Two binaries

Compile `cli.ts` and `daemon.ts` separately. The CLI spawns `browse-daemon`. Simpler code, but two artefacts to distribute.

**Decision: Option A.** Single binary is a core project goal.

### Implementation

`cli.ts` becomes the entry point for both modes:

```ts
if (process.argv.includes("--daemon")) {
  await startDaemon();
} else {
  await runCli();
}
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `playwright` | Browser automation (Chromium) |

No other runtime dependencies. Playwright is the only addition to `package.json`.

**Note:** Playwright requires a one-time browser install: `bunx playwright install chromium`. This is a setup step, not a runtime dependency.

---

## Testing Strategy

### Unit tests (Bun test runner)

- **Protocol parsing:** Malformed JSON, missing fields, unknown commands.
- **Lifecycle:** PID file creation/cleanup, stale PID detection, socket file cleanup.
- **Argument parsing:** Valid commands, missing args, unknown commands, help text.

### Integration tests

- Spin up daemon programmatically (not detached).
- Send commands over the socket, assert responses.
- Test the cold-start flow: daemon not running → CLI starts it → command succeeds.
- Test idle timeout: set timeout to 1 second, wait, confirm daemon exits.
- Test `quit`: send quit, confirm socket and PID file cleaned up.

### Manual smoke test

```bash
bun build --compile ./src/cli.ts --outfile dist/browse
./dist/browse goto https://example.com   # → "Example Domain"
./dist/browse text                        # → page text
./dist/browse quit                        # → "Daemon stopped."
```

---

## Acceptance Criteria

1. `browse goto <url>` navigates and returns the page title.
2. `browse text` returns visible text content of the current page.
3. `browse quit` shuts down the daemon, cleans up socket and PID file.
4. First invocation cold-starts the daemon automatically; subsequent calls reuse it.
5. Daemon exits after 30 minutes of inactivity.
6. `bun build --compile` produces a single working binary.
7. Session state (cookies) persists across commands within a daemon session.
8. Errors (bad URLs, timeouts, missing args) produce clear messages to stderr.

---

## Resolved Questions

1. **User data directory location** — `~/.bun-browse/` for persistent user data across daemon restarts.
2. **Bun compile + Playwright compatibility** — Assume it works. If it doesn't, reassess options then.
3. **Socket permissions** — Restrict to 0o600 (owner-only) from Phase 0.
