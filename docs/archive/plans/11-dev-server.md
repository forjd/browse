# Plan 11: Dev Server Lifecycle Management

**Priority:** Tier 2 — Medium Impact
**Personas:** Frontend Developer, QA Engineer
**New config key:** `devServer` in `browse.config.json`
**New commands:** `dev`

---

## Problem

Frontend developers want `browse` to start their dev server, wait for it to be ready, run tests/flows, then tear it down — like Playwright's `webServer` config. Currently they must orchestrate this externally with shell scripts or `concurrently`.

## Design

### Configuration

Add `devServer` key to `browse.config.json`:

```json
{
  "devServer": {
    "command": "npm run dev",
    "url": "http://localhost:3000",
    "timeout": 30000,
    "reuseExisting": true,
    "env": {
      "NODE_ENV": "test",
      "DATABASE_URL": "postgres://localhost/test"
    },
    "cwd": "."
  }
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `command` | Shell command to start dev server | required |
| `url` | URL to poll for readiness | required |
| `timeout` | Max ms to wait for server ready | `30000` |
| `reuseExisting` | Skip starting if URL already responds | `true` |
| `env` | Additional environment variables | `{}` |
| `cwd` | Working directory for command | `.` |

### Command Interface

```bash
# Start dev server, run a flow, stop server
browse dev --flow smoke-test

# Start dev server, run healthcheck, stop server
browse dev --healthcheck

# Start dev server and drop into REPL
browse dev --repl

# Start dev server and run arbitrary command
browse dev -- flow checkout --var base_url=http://localhost:3000

# Just start the dev server (keep running)
browse dev start

# Stop the dev server
browse dev stop

# Check if dev server is running
browse dev status
```

### Lifecycle

```
browse dev --flow smoke-test
       │
       ▼
1. Check if URL already responds (if reuseExisting)
   ├─ Yes → skip to step 3
   └─ No  → continue
       │
       ▼
2. Spawn dev server process
   ├─ Run `command` with env vars
   ├─ Poll `url` every 500ms
   ├─ Timeout after `timeout` ms
   └─ Log: "Dev server ready at http://localhost:3000 (4.2s)"
       │
       ▼
3. Execute the specified task
   ├─ --flow: run flow with base_url=url
   ├─ --healthcheck: run healthcheck
   ├─ --repl: start REPL
   └─ -- <cmd>: run arbitrary browse command
       │
       ▼
4. Tear down (unless reuseExisting matched)
   ├─ Kill dev server process tree (SIGTERM, then SIGKILL after 5s)
   └─ Log: "Dev server stopped"
       │
       ▼
5. Exit with task's exit code
```

### Implementation

**File:** `src/commands/dev.ts` (~200 lines)
**File:** `src/dev-server.ts` (~200 lines)

1. **`DevServerManager`** (`src/dev-server.ts`):
   - `start()`: spawn child process, poll URL, return when ready
   - `stop()`: kill process tree (handle both Unix and edge cases)
   - `isRunning()`: check if URL responds with 200
   - Uses `Bun.spawn()` for process management
   - Pipes stdout/stderr to a log file (`~/.bun-browse/dev-server.log`)
   - Handles SIGTERM/SIGINT to clean up child process

2. **URL readiness check**:
   - HTTP GET to `url` every 500ms
   - Accept any 2xx response as "ready"
   - Accept connection refused as "not ready yet"
   - Accept timeout as "not ready yet"

3. **Process cleanup**:
   - Kill process group (`process.kill(-pid, 'SIGTERM')`) to catch child processes
   - If still alive after 5s, SIGKILL
   - Register cleanup in daemon's shutdown handler

4. **`browse dev` command**:
   - Parse sub-commands and flags
   - Start server if needed
   - Run task
   - Stop server if we started it
   - Forward exit code

### Integration with Flows

The `devServer` config is automatically used when flows reference `{{dev_url}}`:

```json
{
  "devServer": {
    "command": "npm run dev",
    "url": "http://localhost:3000"
  },
  "flows": {
    "smoke": {
      "steps": [
        { "goto": "{{dev_url}}/login" },
        { "assert": { "textContains": "Sign in" } }
      ]
    }
  }
}
```

Running `browse dev --flow smoke` automatically sets `dev_url` to the configured URL.

## Testing

**File:** `test/dev-server.test.ts`

- Test URL readiness polling (mock HTTP responses)
- Test reuseExisting detection
- Test process spawning and cleanup
- Test timeout behavior
- Test environment variable passing

## Dependencies

- No new dependencies — uses built-in `Bun.spawn()` and `fetch()`

## Estimated Scope

- `src/commands/dev.ts` — ~200 lines
- `src/dev-server.ts` — ~200 lines
- `test/dev-server.test.ts` — ~150 lines
- Config schema update — ~20 lines
- Help, protocol, daemon wiring — ~50 lines
