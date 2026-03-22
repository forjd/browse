# Plan 10: Event Streaming & Subscriptions

**Priority:** Tier 2 — Medium Impact
**Personas:** AI/LLM Application Developer, DevOps Engineer
**New commands:** `subscribe`

---

## Problem

AI agents currently poll for state changes using `console --keep`, `network --keep`, and repeated `snapshot` calls. There's no way to receive real-time events as they happen. Agents building on the pool API need a streaming observation protocol to make decisions reactively instead of polling.

## Design

### Command Interface

```bash
# Subscribe to all events (NDJSON stream to stdout)
browse subscribe

# Subscribe to specific event types
browse subscribe --events navigation,console,network

# Subscribe with filters
browse subscribe --events console --level error
browse subscribe --events network --status 4xx,5xx

# Timeout after N seconds of silence
browse subscribe --idle-timeout 60

# Subscribe from a specific session
browse subscribe --session my-session --events navigation
```

### Event Types

| Event | Trigger | Payload |
|-------|---------|---------|
| `navigation` | Page URL changes | `{ url, status, timing }` |
| `console` | Console message | `{ level, text, source, line }` |
| `network` | Request completes | `{ url, method, status, duration, size }` |
| `dialog` | Dialog appears | `{ type, message }` |
| `download` | Download starts | `{ url, filename, size }` |
| `error` | Page error/crash | `{ message, stack }` |
| `dom` | DOM mutation (opt-in) | `{ type, target, summary }` |

### Output Format (NDJSON)

Each line is a self-contained JSON object:

```json
{"ts":"2026-03-22T10:00:01.234Z","event":"navigation","data":{"url":"https://example.com/dashboard","status":200,"timing":{"ttfb":120,"load":890}}}
{"ts":"2026-03-22T10:00:01.567Z","event":"console","data":{"level":"error","text":"Failed to fetch /api/users","source":"app.js","line":42}}
{"ts":"2026-03-22T10:00:02.100Z","event":"network","data":{"url":"https://api.example.com/users","method":"GET","status":500,"duration":234,"size":0}}
```

### Architecture

```
┌─ Daemon ──────────────────────────────────────┐
│                                                │
│  EventBus (new)                                │
│  ├─ Playwright page.on('console', ...)        │
│  ├─ Playwright page.on('request/response')    │
│  ├─ Playwright page.on('dialog', ...)         │
│  ├─ Playwright page.on('download', ...)       │
│  ├─ CDP Page.frameNavigated                   │
│  └─ CDP Runtime.exceptionThrown               │
│       │                                        │
│       ▼                                        │
│  SubscriptionManager                           │
│  ├─ Filter by event type                      │
│  ├─ Filter by level/status                    │
│  └─ Emit to connected subscribers             │
└──────────────┬─────────────────────────────────┘
               │ NDJSON stream over socket
               ▼
         CLI stdout (streaming)
```

### Implementation

**File:** `src/commands/subscribe.ts` (~100 lines)
**File:** `src/event-bus.ts` (~250 lines)

1. **EventBus** (`src/event-bus.ts`):
   - Central event aggregator that collects events from all Playwright listeners
   - Already partially exists via console/network ring buffers — generalize them
   - Each event is timestamped and typed
   - Supports multiple concurrent subscribers
   - Events are fire-and-forget (no backpressure — subscribers that are slow lose events)

2. **SubscriptionManager**:
   - Part of EventBus
   - Each subscriber registers with a filter: `{ events: ['console', 'network'], level: 'error', status: '4xx' }`
   - On each event: check all subscribers, emit to matching ones

3. **Subscribe command** (`src/commands/subscribe.ts`):
   - Parse `--events` into filter
   - Register subscriber with EventBus
   - Stream events as NDJSON to the socket response
   - This requires a **long-lived connection** — different from normal request/response
   - Implementation: use chunked response (write to socket without closing)
   - CLI side: read lines from socket as they arrive, print to stdout

4. **Protocol change**:
   - Current protocol is request → response → close
   - `subscribe` needs: request → streaming response (keep connection open)
   - Add a `streaming: true` flag in the response header
   - CLI detects this and switches to line-by-line reading mode

5. **Idle timeout**:
   - If no events for `--idle-timeout` seconds, close stream and exit
   - Default: no timeout (run until Ctrl+C)

### TCP/Remote Support

When daemon is started with `--listen <addr>`:
- Subscribe works over TCP too
- Remote agents can connect and subscribe to events
- Same NDJSON protocol over TCP

### Pool API Extension

```typescript
import { createPool } from "browse/pool";

const pool = createPool({ socketPath: "/tmp/browse-daemon.sock" });
const session = await pool.acquire();

// Subscribe to events programmatically
const subscription = session.subscribe({
  events: ['console', 'network'],
  filter: { level: 'error' }
});

for await (const event of subscription) {
  console.log(event);
  if (event.event === 'network' && event.data.status >= 500) {
    // React to server errors
  }
}

subscription.unsubscribe();
session.release();
```

## Testing

**File:** `test/subscribe.test.ts`

- Test EventBus registration and filtering
- Test NDJSON output format
- Test multiple concurrent subscribers
- Test event type filtering
- Test idle timeout
- Mock Playwright events and verify they propagate

## Dependencies

- No new dependencies

## Estimated Scope

- `src/event-bus.ts` — ~250 lines
- `src/commands/subscribe.ts` — ~100 lines
- Protocol streaming support — ~50 lines
- Pool API extension — ~80 lines
- `test/subscribe.test.ts` — ~200 lines
- Help, daemon wiring — ~50 lines
