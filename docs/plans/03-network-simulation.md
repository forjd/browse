# Plan 03: Network Condition Simulation

**Priority:** Tier 1 — High Impact
**Personas:** Chaos Engineer, Performance Engineer, Frontend Developer
**New commands:** `throttle`, `offline`

---

## Problem

`intercept` can mock individual responses, but there's no way to simulate real-world network conditions: slow 3G, high latency, packet loss, or offline transitions. Engineers can't test how their UI degrades gracefully without these tools.

## Design

### Command Interface

```bash
# Apply a named preset
browse throttle 3g
browse throttle 4g
browse throttle slow-3g
browse throttle wifi
browse throttle cable

# Custom conditions
browse throttle --download 500 --upload 100 --latency 400
# (download/upload in KB/s, latency in ms)

# Remove throttling
browse throttle off

# Toggle offline mode
browse offline on
browse offline off

# Check current state
browse throttle status
```

### Presets

| Preset | Download | Upload | Latency | Notes |
|--------|----------|--------|---------|-------|
| `slow-3g` | 50 KB/s | 25 KB/s | 2000 ms | Near-unusable |
| `3g` | 187 KB/s | 75 KB/s | 400 ms | Standard mobile |
| `4g` | 1500 KB/s | 750 KB/s | 60 ms | Good mobile |
| `wifi` | 3750 KB/s | 1500 KB/s | 20 ms | Average WiFi |
| `cable` | 6250 KB/s | 3125 KB/s | 5 ms | Wired broadband |

### Architecture

Uses CDP `Network.emulateNetworkConditions` (Chromium-only) to control:
- `downloadThroughput` (bytes/s)
- `uploadThroughput` (bytes/s)
- `latency` (ms added to every request)
- `offline` (boolean)

```
browse throttle 3g
       │
       ▼
┌─ Daemon ──────────────────────────────────┐
│  CDPSession.send('Network.emulate...')    │
│  Store current throttle state in memory   │
│  All subsequent requests are throttled    │
└───────────────────────────────────────────┘
```

### Implementation

**File:** `src/commands/throttle.ts` (~150 lines)
**File:** `src/commands/offline.ts` (~40 lines)

1. **`handleThrottle`**:
   - Parse preset name or custom `--download`/`--upload`/`--latency` flags
   - Get CDP session: `page.context().newCDPSession(page)` (already used in `cdp-console.ts`)
   - Call `cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput, uploadThroughput, latency })`
   - Store state in daemon context for `throttle status`
   - For `throttle off`: send with `-1` throughput values (disable)

2. **`handleOffline`**:
   - Shortcut for `Network.emulateNetworkConditions` with `offline: true`
   - `offline on`: set offline flag, preserve current throughput settings
   - `offline off`: clear offline flag, restore previous settings

3. **`throttle status`**:
   - Return current state: `Throttle: 3g (187 KB/s ↓, 75 KB/s ↑, 400ms latency)` or `Throttle: off`

4. **Browser compatibility**:
   - CDP is Chromium-only; for Firefox/WebKit, return error: `"Network throttling requires Chromium. Current browser: firefox"`
   - Check `browserName` from context before attempting CDP

### Integration with `perf`

When throttle is active, `perf` output should include a note:
```
⚠ Network throttled: 3g (187 KB/s ↓, 400ms latency)
Core Web Vitals:
  LCP: 4200ms (FAIL — budget 2500ms)
  ...
```

### Integration with Flows

Add a new flow step type:

```json
{
  "steps": [
    { "throttle": "3g" },
    { "goto": "{{base_url}}/dashboard" },
    { "assert": { "textContains": "Dashboard" } },
    { "throttle": "off" }
  ]
}
```

## Testing

**File:** `test/throttle.test.ts`

- Test preset resolution (name → throughput values)
- Test custom flag parsing
- Mock CDP session, verify correct parameters sent
- Test status output formatting
- Test browser compatibility check (error on non-Chromium)
- Test flow step integration

## Dependencies

- No new dependencies — CDP is already used for console capture
- Chromium-only (Firefox/WebKit will get clear error messages)

## Estimated Scope

- `src/commands/throttle.ts` — ~150 lines
- `src/commands/offline.ts` — ~40 lines
- `test/throttle.test.ts` — ~150 lines
- Flow runner extension — ~20 lines
- Help, protocol, daemon wiring — ~50 lines
