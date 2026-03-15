# Phase 6 — Hardening

**Goal:** Production-grade reliability. Graceful crash recovery, per-command timeouts, CI pipeline, performance benchmarking, and security hygiene.

**Prerequisite:** Phase 5 (skill file and integration) — see `phase-5-skill-and-integration.md`.

---

## File Structure (additions to Phase 5)

```
src/
  commands/
    wipe.ts           # Clear all session data without killing daemon
    benchmark.ts      # Measure latency for core operations
  retry.ts            # Crash detection and single-retry logic for CLI
  timeout.ts          # Per-command timeout wrapper

test/
  unit/
    retry.test.ts
    timeout.test.ts
    ref-assignment.test.ts
  integration/
    crash-recovery.test.ts
    timeout.test.ts
    benchmark.test.ts
    wipe.test.ts

.github/
  workflows/
    ci.yml            # Build + test on macOS and Ubuntu
```

---

## Protocol Changes

### Request

Extend the command union from Phase 5:

```ts
type Request = {
  cmd: "goto" | "text" | "quit" | "snapshot" | "click" | "fill" | "select"
     | "screenshot" | "console" | "network"
     | "auth-state" | "login" | "tab"
     | "flow" | "assert" | "healthcheck"
     | "wipe" | "benchmark";
  args: string[];
  timeout?: number;    // Per-command timeout in ms (overrides config/default)
};
```

The `timeout` field is optional. When present, the daemon enforces it for that command. When absent, the daemon uses the config default or the hardcoded 30s.

### Response

No changes to the response type. Timeout errors return `{ ok: false, error: "Command timed out after 30000ms" }`.

---

## Error Handling and Crash Recovery

### Browser crash detection (daemon side)

The daemon monitors the Chromium process for unexpected exits. Playwright emits a `disconnected` event on the browser object when the process crashes or is killed externally.

```ts
browser.on("disconnected", () => {
  // Browser process died — clean up and exit
  // The CLI will cold-start a fresh daemon on next invocation
});
```

On `disconnected`:

1. Log the crash (to stderr, not stdout — the daemon has no active client connection at this point).
2. Remove the socket file and PID file.
3. Exit the daemon process.

The daemon does **not** attempt to relaunch the browser internally. A clean exit lets the CLI's existing cold-start logic handle recovery.

### Crash recovery (CLI side — `retry.ts`)

The CLI already handles the case where the daemon isn't running (cold-start). Crash recovery extends this to handle mid-command failures:

**Detection:** The CLI detects a crash when:

- The socket connection drops unexpectedly (read returns EOF before a complete JSON response).
- The socket connection is refused after previously succeeding (daemon died between connect and response).

**Recovery flow:**

1. Detect the connection failure.
2. Clean up any stale socket/PID files (the daemon may not have cleaned up if it crashed hard).
3. Cold-start a fresh daemon (same logic as Phase 0 — spawn self with `--daemon`, poll socket).
4. Retry the original command **once**.
5. If the retry also fails, return the error to the user: `"Daemon crashed and recovery failed. Error: <details>"`.

**Guard against retry loops:** A flag tracks whether the current invocation is already a retry. If so, do not attempt another restart — fail immediately.

### Retry semantics

Only connection-level failures trigger a retry. Application-level errors (`{ ok: false, error: "..." }`) are returned as-is — they indicate a problem with the command, not the daemon.

---

## Per-Command Timeouts (`timeout.ts`)

Every command execution on the daemon side is wrapped in a timeout. If the underlying Playwright operation exceeds the limit, the daemon aborts the operation and returns an error.

### Timeout precedence (three-tier)

1. **CLI flag** (`--timeout 60000`) — highest priority, per-invocation.
2. **Config file** (`browse.config.json` → `"timeout": 45000`) — project-level default.
3. **Hardcoded default** — 30,000ms.

### Config extension

```ts
type BrowseConfig = {
  // ... existing fields from Phases 3–4
  timeout?: number;   // Default timeout in ms for all commands
};
```

### CLI flag

```
browse goto https://slow-page.example.com --timeout 60000
```

The CLI parses `--timeout` from args before sending the request. The value is included in the request's `timeout` field.

### Implementation

The daemon wraps each command handler in a `Promise.race` against a timeout:

```ts
async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Command timed out after ${ms}ms`)), ms)
  );
  return Promise.race([fn(), timeout]);
}
```

### Timeout error format

```
Error: Command timed out after 30000ms
```

The error message includes the timeout value so the user knows whether to increase it.

### Commands exempt from timeout

- `quit` — always completes (shutdown sequence).
- `benchmark` — manages its own timing internally.

---

## Wipe Command (`wipe.ts`)

Clears all session data without killing the daemon. A full reset to a clean-slate state.

### Usage

```
browse wipe
```

### Behaviour

1. Close all open tabs except one.
2. Navigate the remaining tab to `about:blank`.
3. Clear all cookies: `context.clearCookies()`.
4. Clear localStorage and sessionStorage for all origins via `page.evaluate()`.
5. Clear the console message buffer (Phase 2).
6. Clear the network request buffer (Phase 2).
7. Invalidate all current refs (Phase 1).
8. Return `{ ok: true, data: "Session wiped." }`.

### Output

```
Session wiped.
```

### Error handling

If any step fails (e.g., clearing storage on a crashed page), continue with the remaining steps and report partial success:

```
Session wiped (with warnings).
  ⚠ Failed to clear localStorage for https://example.com: <error>
```

---

## Benchmark Command (`benchmark.ts`)

Measures latency for core operations. Run manually to establish baselines and detect regressions. Not run in CI — browser performance varies too much across runners.

### Usage

```
browse benchmark [--iterations 10]
```

### Operations benchmarked

| Operation | What it measures |
|-----------|-----------------|
| `goto` (local) | Navigation to a data URL (`data:text/html,...`) — pure browser overhead |
| `goto` (remote) | Navigation to `https://example.com` — includes network |
| `snapshot` | Accessibility tree extraction and ref assignment |
| `screenshot` | Full-page screenshot to temp file |
| `click` | Ref resolution + click (on a button in the data URL page) |
| `fill` | Ref resolution + clear + type (on an input in the data URL page) |

### Test page

The benchmark creates a data URL page with a known structure (a form with inputs, buttons, links) to provide consistent measurements for interaction commands.

### Output format

```
Benchmark (10 iterations each):

  goto (local)     p50:  12ms   p95:  18ms   p99:  22ms
  goto (remote)    p50: 142ms   p95: 198ms   p99: 247ms
  snapshot         p50:   8ms   p95:  14ms   p99:  19ms
  screenshot       p50:  45ms   p95:  62ms   p99:  78ms
  click            p50:  11ms   p95:  16ms   p99:  21ms
  fill             p50:  14ms   p95:  19ms   p99:  25ms

Target: p95 < 200ms for non-screenshot commands.
```

### Implementation

For each operation:

1. Run it `n` times (default 10, configurable via `--iterations`).
2. Record each duration using `performance.now()`.
3. Sort durations and compute p50, p95, p99.
4. Format and return as the response data string.

The benchmark manages its own setup and teardown — it navigates to the test page, takes measurements, then restores the previous page state.

---

## Testing

### Unit tests

#### Ref assignment (`ref-assignment.test.ts`)

Tests for the Phase 1 ref assignment logic, now covered as part of hardening:

- **Deterministic ordering:** Same accessibility tree always produces the same ref assignments.
- **Element filtering (default):** Only interactive elements (buttons, links, inputs, selects, checkboxes, radios, textareas) get refs.
- **Element filtering (`-i` flag):** Structural elements (headings, paragraphs, list items) also get refs.
- **Element filtering (`-f` flag):** All nodes get refs.
- **Empty tree:** Returns empty output, no crash.
- **Deeply nested tree:** Correct depth-first ordering with refs assigned sequentially.
- **Special characters:** Element names with quotes, newlines, unicode — formatted correctly in output.

#### Retry logic (`retry.test.ts`)

- Connection refused → triggers cold-start and retry → returns result on success.
- Connection drops mid-read → triggers restart and retry → returns result on success.
- Retry fails → returns error without further retry.
- Application-level error (`ok: false`) → no retry, error returned directly.
- Already in retry state → no further retry attempt.

#### Timeout logic (`timeout.test.ts`)

- Operation completes within timeout → returns result normally.
- Operation exceeds timeout → returns timeout error with duration in message.
- Timeout of 0 → uses default (not infinite).
- CLI `--timeout` flag parsed correctly from args.
- Config file timeout used when no CLI flag.
- CLI flag overrides config file value.

### Integration tests

All integration tests use a local test server (extending the Phase 4 fixture).

#### Crash recovery (`crash-recovery.test.ts`)

- Kill the daemon process externally → next CLI command cold-starts a new daemon and succeeds.
- Simulate browser crash (kill Chromium process) → daemon exits cleanly → next CLI command recovers.
- Verify stale socket and PID files are cleaned up during recovery.
- Verify session state is lost after crash (expected — no automatic state preservation on crash).

#### Timeout (`timeout.test.ts`)

- Send a command to a page that hangs (test server endpoint with intentional delay) → verify timeout error after configured duration.
- Verify `--timeout` flag overrides default.
- Verify config file `timeout` field is respected.
- Verify `quit` is not subject to timeout.

#### Wipe (`wipe.test.ts`)

- Log in (set cookies) → `wipe` → verify cookies are cleared (navigating to an auth-required page shows login).
- Open multiple tabs → `wipe` → verify only one tab remains at `about:blank`.
- Accumulate console messages → `wipe` → `console` returns empty.
- Accumulate network requests → `wipe` → `network` returns empty.
- Set refs via `snapshot` → `wipe` → verify refs are invalidated (using old ref returns stale error).

#### Benchmark (`benchmark.test.ts`)

- `benchmark` completes without error.
- Output contains all expected operations.
- Output contains p50, p95, p99 values.
- `--iterations 3` runs with fewer iterations (verify by timing).

### CI Pipeline (`.github/workflows/ci.yml`)

#### Matrix

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest]
```

#### Steps

1. **Checkout** repository.
2. **Install Bun** — use `oven-sh/setup-bun@v2`.
3. **Install dependencies** — `bun install`.
4. **Install Playwright browsers** — `bunx playwright install chromium --with-deps` (the `--with-deps` flag installs system dependencies on Ubuntu, needed for headless Chromium).
5. **Run tests** — `bun test`.
7. **Compile binary** — `bun build --compile ./src/cli.ts --outfile dist/browse`.
8. **Smoke test binary** — `./dist/browse goto data:text/html,<h1>CI</h1>` → verify output contains "CI".

#### Notes

- Integration tests that require a browser use Playwright in headless mode (the default). No Xvfb needed — modern Playwright headless works without a display server.
- The smoke test uses a `data:` URL to avoid network dependencies in CI.
- No artefact upload — the CI pipeline validates that the build and tests pass, not that a release is produced.

---

## Performance

### Targets

| Metric | Target |
|--------|--------|
| Non-screenshot command latency (p95) | < 200ms |
| Screenshot command latency (p95) | < 500ms |
| Daemon cold-start time | < 5s |
| Daemon memory (idle, 1 tab) | < 200MB |
| Daemon memory (after 100 snapshot cycles) | < 250MB (no leak) |

### Memory leak prevention

The primary risk is accumulated ref maps from `snapshot` calls. Phase 1 already clears the ref map on each `snapshot`, so refs from previous calls are garbage-collected. The hardening work validates this:

- Run 100 snapshot cycles in a test.
- Measure heap usage before and after.
- Assert that growth is bounded (< 50MB increase).

This is an integration test, not a CI gate — heap measurement is environment-sensitive.

### Profiling approach

Manual profiling using Bun's built-in heap snapshot:

```bash
# Start daemon with inspect flag
browse --daemon --inspect

# In another terminal, trigger a workload
for i in $(seq 1 100); do browse snapshot; done

# Take heap snapshot via Chrome DevTools or Bun's API
```

No automated profiling infrastructure. The benchmark command covers latency; manual heap snapshots cover memory.

---

## Security

### Socket permissions

Already restricted to `0o600` (owner-only) since Phase 0. Phase 6 adds a startup check to verify permissions haven't been changed:

```ts
const stats = fs.statSync(socketPath);
if ((stats.mode & 0o777) !== 0o600) {
  // Re-set permissions
  fs.chmodSync(socketPath, 0o600);
}
```

### Credential safety

- The daemon never logs command arguments to stdout or any log file. Command args may contain passwords (from `fill` commands or `--var` flags with credentials).
- The `wipe` command documentation explicitly notes that it clears cookies and tokens from memory.
- Auth state files (`auth-state save`) are written with `0o600` permissions.

### `browse wipe` as security tool

Document in SKILL.md that `browse wipe` should be used:

- After testing with production-like credentials.
- Before switching between user roles/accounts.
- At the end of a QA session.

### PID file safety

The PID file at `/tmp/browse-daemon.pid` is already checked on startup (Phase 0). Phase 6 adds:

- Verify the PID file content is a valid integer before using it.
- If the PID file contains garbage, treat it as stale and overwrite.

---

## CLI Argument Parsing Updates

New commands and flags:

```
browse wipe                                → cmd: "wipe",      args: []
browse benchmark                           → cmd: "benchmark", args: []
browse benchmark --iterations 20           → cmd: "benchmark", args: ["--iterations", "20"]
browse goto https://example.com --timeout 60000  → cmd: "goto", args: ["https://example.com"], timeout: 60000
```

The `--timeout` flag is parsed and removed from `args` by the CLI before constructing the request. It is sent as the `timeout` field on the request object, not as part of `args`.

---

## Config Extensions

### `browse.config.json` additions

```ts
type BrowseConfig = {
  // ... existing fields from Phases 3–4
  timeout?: number;   // Default command timeout in ms (default: 30000)
};
```

Example:

```json
{
  "environments": { "...": "..." },
  "flows": { "...": "..." },
  "timeout": 45000
}
```

No breaking changes — existing configs remain valid.

---

## Acceptance Criteria

1. Browser crashes are detected and the daemon exits cleanly (socket and PID files removed).
2. The CLI automatically recovers from daemon crashes — restarts the daemon and retries the command once.
3. Application-level errors (`ok: false`) are not retried.
4. A second retry is never attempted — if recovery fails, the error is returned immediately.
5. Every command (except `quit` and `benchmark`) is subject to a configurable timeout.
6. Timeout precedence: CLI `--timeout` flag > config file `timeout` > 30s default.
7. Timeout errors include the timeout value in the message.
8. `browse wipe` clears cookies, localStorage, sessionStorage, console buffer, network buffer, refs, and closes all tabs except one.
9. `browse wipe` reports partial success if some cleanup steps fail.
10. `browse benchmark` measures and reports p50/p95/p99 latency for core operations.
11. `browse benchmark --iterations N` controls the number of iterations.
12. Unit tests cover ref assignment determinism, retry logic, and timeout logic.
13. Integration tests cover crash recovery, timeout behaviour, wipe, and benchmark.
14. CI pipeline runs on both macOS and Ubuntu via GitHub Actions.
15. CI compiles the binary and runs a smoke test on both platforms.
16. Non-screenshot commands meet the p95 < 200ms target (validated via benchmark, not CI).
17. No memory leaks from accumulated ref maps (validated via integration test with 100 snapshot cycles).
18. Socket file permissions are verified and corrected on startup.
19. Auth state files are written with `0o600` permissions.
20. The daemon never logs command arguments (credential safety).

---

## Resolved Questions

1. **CI platform** — GitHub Actions with a macOS + Ubuntu matrix. Standard for open-source and small-team projects, no infrastructure to manage, Bun and Playwright both have first-party GitHub Actions support.
2. **Command timeout configurability** — Three-tier precedence: CLI flag > config file > hardcoded 30s default. This gives per-invocation control without requiring config for simple usage, and project-level defaults for teams that always hit slow applications.
3. **`browse wipe` scope** — Full reset: cookies, localStorage, sessionStorage, console buffer, network buffer, refs, and tabs collapsed to one blank. The command's purpose is "clean slate without restarting the daemon" — anything less leaves ambiguity about what state remains.
4. **Crash recovery retry** — Auto-retry once. The CLI already handles cold-start, so crash recovery is a natural extension. Limiting to one retry avoids loops. Only connection-level failures trigger retry — application errors are returned directly.
5. **Performance benchmarks** — A `browse benchmark` command that runs manually and prints p50/p95/p99 for core operations. Not run in CI — browser performance varies too much across runners to produce stable results. CI validates correctness (tests pass, binary compiles); benchmarking validates performance (run manually against a known environment).
6. **In-process browser restart vs. daemon exit** — The daemon exits on browser crash rather than attempting to relaunch Chromium internally. Restarting Playwright's browser within the same process risks leaked state, half-initialised contexts, and subtle bugs. A clean exit + CLI cold-start is simpler and more reliable — the CLI already knows how to start a daemon from scratch.
7. **Memory leak testing** — Integration test that runs 100 snapshot cycles and asserts bounded heap growth. Not a CI gate — heap measurement is environment-sensitive. Manual profiling via Bun's inspect mode for deeper investigation.
