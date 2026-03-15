# Sessions, Tabs, and the Pool Library

## Sessions

### What Are Sessions?

Sessions are named browser contexts that allow multiple independent page groups within one Chromium process. A default session (`"default"`) always exists and is used when no `--session` flag is provided.

Each session has its own:

- Tab registry
- Dialog state
- Intercept state
- Console and network buffers

### Creating Sessions

```sh
browse session create worker-1              # shared context
browse session create worker-2 --isolated   # isolated context
```

### Shared vs Isolated

- **Shared** (default): sessions share the browser context — same cookies, storage, and permissions. Changes in one session are visible in others.
- **Isolated** (`--isolated`): creates a fully separate browser context with its own cookies, localStorage, sessionStorage, and permissions. Stealth settings are propagated to isolated contexts.

### Routing Commands to Sessions

Use the `--session` flag to target a specific session:

```sh
browse --session worker-1 goto https://a.com
browse --session worker-2 goto https://b.com
browse --session worker-1 snapshot
```

### Managing Sessions

```sh
browse session list              # list all sessions with their names
browse session close worker-1    # close session and all its pages
```

The default session cannot be closed.

### Per-Session State

Each session maintains independently:

- **Tab registry**: separate set of tabs with their own active tab index
- **Dialog state**: dialog auto-accept/dismiss mode and pending dialogs
- **Intercept state**: network interception rules
- **Console buffer**: ring buffer (500 entries) per tab
- **Network buffer**: ring buffer (500 entries) per tab

### Use Cases

- Running multiple test scenarios in parallel without cookie interference
- Comparing logged-in vs logged-out views
- Multi-user testing (e.g., testing a chat app with two accounts)

## Tabs

### Managing Tabs

```sh
browse tab list              # list open tabs with titles and URLs
browse tab new               # open new blank tab
browse tab new https://...   # open tab at URL
browse tab switch 2          # switch to tab 2 (1-indexed)
browse tab close             # close active tab
browse tab close 2           # close tab 2
```

### How Tabs Work

- Each session has a `TabRegistry` with an array of tab states.
- Each tab has its own page, console buffer (500 entries), and network buffer (500 entries).
- The active tab index tracks which tab receives commands.
- New tabs inherit the session's browser context (shared or isolated).
- Closing a tab switches to the nearest remaining tab.
- Console and network logs are per-tab, not per-session.
- The last remaining tab in a session cannot be closed — use `browse quit` to stop the daemon instead.

## Pool Library

### What Is the Pool?

A programmatic API for managing multiple browse sessions — useful for multi-agent orchestration, parallel testing, or any code that needs concurrent browser access.

### Import

```typescript
import { createPool } from "browse/pool";
```

### API

```typescript
type PoolOptions = {
  socketPath: string;        // Path to daemon socket
  maxSessions?: number;      // Default: 10
  idleTimeoutMs?: number;    // Default: 60000 (60s)
  warmCount?: number;        // Pre-warm this many sessions (default: 0)
  isolated?: boolean;        // Create isolated contexts (default: false)
};

type SessionHandle = {
  id: string;
  exec: (cmd: string, ...args: string[]) => Promise<Response>;
  release: () => void;
};

type BrowsePool = {
  acquire: () => Promise<SessionHandle>;
  release: (session: SessionHandle) => void;
  warmUp: (count: number) => Promise<void>;
  stats: () => PoolStats;
  destroy: () => Promise<void>;
};

type PoolStats = {
  active: number;
  idle: number;
  total: number;
  maxSessions: number;
};
```

### Usage Example

```typescript
import { createPool } from "browse/pool";

const pool = createPool({
  socketPath: "/tmp/browse-daemon.sock",
  maxSessions: 5,
  isolated: true,
});

// Pre-warm for fast checkout
await pool.warmUp(3);

// Acquire and use sessions
const session = await pool.acquire();
await session.exec("goto", "https://example.com");
await session.exec("snapshot");
const result = await session.exec("title");
console.log(result.data); // "Example Domain"

// Release back to pool
session.release();

// Check pool stats
console.log(pool.stats()); // { active: 0, idle: 1, total: 1, maxSessions: 5 }

// Clean up
await pool.destroy();
```

### Pool Behaviour

- `acquire()` reuses idle sessions first, creates new ones if needed.
- Throws if the pool is exhausted (active + idle + pending >= `maxSessions`).
- Released sessions start an idle timer (default 60s). If not re-acquired, they are closed automatically.
- `warmUp(n)` pre-creates sessions for fast checkout.
- `destroy()` closes all sessions (active and idle) and clears timers.
- Sessions communicate with the daemon over a Unix socket — the daemon must be running.
- The `warmCount` option triggers non-blocking warm-up on pool creation.

## See Also

- [Architecture](architecture.md)
- [Commands Reference](commands.md)
