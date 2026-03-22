# Plan 19: Scheduled Monitoring & Alerting

**Priority:** Tier 3 — Lower Impact / Niche
**Personas:** Freelance Developer, DevOps Engineer
**New commands:** `monitor`

---

## Problem

`healthcheck` is one-shot with no scheduling or history. Freelancers managing multiple client sites want a lightweight uptime/health monitor that runs checks on a schedule, stores history, and sends alerts when things break — without setting up Pingdom or Datadog.

## Design

### Command Interface

```bash
# Start monitoring (foreground, runs until Ctrl+C)
browse monitor --config monitor.json

# Start as background daemon
browse monitor --config monitor.json --daemon

# Check status of running monitor
browse monitor status

# View recent history
browse monitor history [--last 24h] [--site example.com]

# Stop background monitor
browse monitor stop

# Run once (like healthcheck, but writes to history)
browse monitor check --config monitor.json
```

### Configuration (`monitor.json`)

```json
{
  "interval": "5m",
  "sites": [
    {
      "name": "Client A - Production",
      "url": "https://client-a.com",
      "checks": [
        { "type": "status", "expect": 200 },
        { "type": "text-contains", "value": "Welcome" },
        { "type": "perf", "budget": { "lcp": 3000 } }
      ],
      "flow": null
    },
    {
      "name": "Client B - Dashboard",
      "url": "https://app.client-b.com/login",
      "checks": [
        { "type": "status", "expect": 200 }
      ],
      "flow": "client-b-login-check",
      "loginEnv": "client-b"
    }
  ],
  "alerts": {
    "webhook": "https://hooks.slack.com/services/...",
    "onFailure": true,
    "onRecovery": true,
    "cooldown": "15m"
  },
  "history": {
    "file": "~/.bun-browse/monitor-history.jsonl",
    "retention": "30d"
  }
}
```

### Check Types

| Type | Description |
|------|-------------|
| `status` | HTTP status code check |
| `text-contains` | Page text contains string |
| `text-not-contains` | Page text does not contain string |
| `element-visible` | CSS selector is visible |
| `perf` | Performance budget check |
| `console-no-errors` | No console errors |
| `security-headers` | Security header presence |

### Architecture

```
┌─ Monitor Loop ─────────────────────────────────┐
│                                                  │
│  Scheduler (interval timer)                      │
│       │                                          │
│       ▼                                          │
│  For each site:                                  │
│  ├─ Navigate to URL                              │
│  ├─ Run checks                                   │
│  ├─ Record result to history                     │
│  └─ If failure: send alert (with cooldown)       │
│       │                                          │
│       ▼                                          │
│  Sleep until next interval                       │
└──────────────────────────────────────────────────┘
```

### Implementation

**File:** `src/commands/monitor.ts` (~200 lines)
**File:** `src/monitor-engine.ts` (~350 lines)

1. **Scheduler**:
   - Parse interval string (`5m`, `1h`, `30s`)
   - Use `setInterval` for repeating checks
   - On each tick: iterate sites sequentially (or parallel with `--concurrency`)

2. **Check execution**:
   - Navigate to URL
   - Run each check type (reuse existing command handlers)
   - Collect pass/fail results
   - Calculate response time

3. **History storage**:
   - JSONL file: one line per check result
   - Format: `{"ts":"...","site":"...","status":"pass|fail","duration":234,"checks":[...]}`
   - Automatic retention: delete entries older than configured retention

4. **Alerting**:
   - **Webhook** (Slack, Discord, generic): POST JSON payload
   - **Alert payload**:
     ```json
     {
       "site": "Client A - Production",
       "url": "https://client-a.com",
       "status": "down",
       "failedChecks": ["text-contains: 'Welcome' not found"],
       "duration": "15m",
       "timestamp": "2026-03-22T10:00:00Z"
     }
     ```
   - **Recovery alert**: when a previously failing site passes again
   - **Cooldown**: don't re-alert for same site within cooldown period

5. **Daemon mode** (`--daemon`):
   - Fork the monitor process to background
   - Write PID to `~/.bun-browse/monitor.pid`
   - Log to `~/.bun-browse/monitor.log`
   - `monitor status`: check PID, show uptime and last check results
   - `monitor stop`: send SIGTERM to PID

6. **History viewer** (`monitor history`):
   - Read JSONL file
   - Filter by `--last` duration and `--site` name
   - Show uptime percentage, average response time, failure timeline
   ```
   Site: Client A - Production
   Last 24h: 99.7% uptime (1 failure at 03:15)
   Avg response: 234ms
   Checks: 288 passed, 1 failed

   Failures:
     2026-03-22 03:15 — text-contains: "Welcome" not found (recovered 03:20)
   ```

### Integration with Existing Config

If `browse.config.json` has a `healthcheck` section, `monitor` can reuse it:

```bash
# Monitor using healthcheck config
browse monitor --healthcheck --interval 5m
```

## Testing

**File:** `test/monitor.test.ts`

- Test interval parsing
- Test check execution with mock page
- Test history file write/read
- Test retention cleanup
- Test webhook alert format
- Test cooldown logic
- Test recovery detection

## Dependencies

- No new dependencies (webhook is just `fetch()`)

## Estimated Scope

- `src/commands/monitor.ts` — ~200 lines
- `src/monitor-engine.ts` — ~350 lines
- `test/monitor.test.ts` — ~250 lines
- Help, protocol, daemon wiring — ~50 lines
