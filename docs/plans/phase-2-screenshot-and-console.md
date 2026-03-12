# Phase 2 — Screenshot and Console

**Goal:** The agent can see rendered output, catch JS errors, and detect failed network requests.

**Prerequisite:** Phase 1 (snapshot and ref system) — see `phase-1-snapshot-and-refs.md`.

---

## File Structure (additions to Phase 1)

```
src/
  commands/
    screenshot.ts   # Full-page, viewport, or element screenshot
    console.ts      # Console message buffer and retrieval
    network.ts      # Failed request buffer and retrieval
  buffers.ts        # Shared ring-buffer logic for console and network
```

---

## Protocol Changes

### Request

Extend the command union from Phase 1:

```ts
type Request = {
  cmd: "goto" | "text" | "quit" | "snapshot" | "click" | "fill" | "select"
     | "screenshot" | "console" | "network";
  args: string[];
};
```

### Response — binary data

Screenshot is the first command that returns a file path rather than text content. The response shape stays the same — `data` contains the file path string. The CLI prints it to stdout so the agent can pass it to image tooling.

---

## Screenshot Command (`screenshot.ts`)

Takes an optional output path. If omitted, auto-generates a timestamped file in a default directory.

### Usage

```
browse screenshot                                 → full-page, auto-generated path
browse screenshot /tmp/page.png                   → full-page, explicit path
browse screenshot --viewport                      → viewport only (no scroll)
browse screenshot --selector ".app-header"        → element-level screenshot
browse screenshot /tmp/header.png --selector "h1" → element + explicit path
```

### Argument parsing

Flags and positional args in `args`:

- If an arg does not start with `--`, treat it as the output path (first non-flag arg wins).
- `--viewport` — capture visible viewport only, no scrolling.
- `--selector <value>` — capture a specific element by CSS selector. The next arg after `--selector` is the selector value.

`--viewport` and `--selector` are mutually exclusive. If both are provided, return an error.

### Default output path

When no path is specified:

1. Ensure directory `~/.bun-browse/screenshots/` exists (create if needed).
2. Generate filename: `screenshot-{timestamp}.png` where timestamp is `YYYYMMDD-HHmmss-SSS` (millisecond precision to avoid collisions).
3. Return the full path in the response.

### Implementation

**Full-page (default):**
```ts
await page.screenshot({ path, fullPage: true });
```

**Viewport only (`--viewport`):**
```ts
await page.screenshot({ path, fullPage: false });
```

**Element (`--selector`):**
```ts
const element = page.locator(selector).first();
await element.screenshot({ path, timeout: 10_000 });
```

If the selector matches no elements, return `{ ok: false, error: "No element matching selector: .app-header" }`.

### Response

```ts
{ ok: true, data: "/Users/dan/.bun-browse/screenshots/screenshot-20260312-143022-417.png" }
```

The CLI prints just the path to stdout. The agent reads this path and passes it to its image tooling.

### Edge cases

- **Path with missing parent directory:** Attempt to create parent directories (`mkdir -p` equivalent) before writing. If creation fails, return an error.
- **Existing file at path:** Overwrite silently. The caller chose the path explicitly.
- **Very tall pages:** Playwright handles full-page screenshots natively, but cap at 16,384px height to avoid memory issues. If the page exceeds this, fall back to viewport-only and note it in the response: `"Page too tall for full-page screenshot (>16384px). Captured viewport only."`.

---

## Console Command (`console.ts`)

Captures and returns browser console messages. Uses a drain-and-clear model: each call returns messages accumulated since the last call, then clears the buffer.

### Usage

```
browse console                → all messages since last call, then clears buffer
browse console --level error  → errors only since last call, then clears buffer
browse console --keep         → all messages since last call, preserves buffer
```

### Console buffer

On daemon startup (or when a new page is created), attach a listener:

```ts
page.on("console", (msg) => {
  consoleBuffer.push({
    level: msg.type(),      // "log", "warning", "error", "info", "debug"
    text: msg.text(),
    location: msg.location() // { url, lineNumber, columnNumber }
  });
});
```

Buffer entries:

```ts
type ConsoleEntry = {
  level: string;
  text: string;
  location: { url: string; lineNumber: number; columnNumber: number };
  timestamp: number;
};
```

### Buffer size limit

Cap the buffer at 500 entries. When full, drop the oldest entry on each new push (ring buffer). This prevents unbounded memory growth if a page is noisy.

### Argument parsing

- `--level <value>` — filter to entries matching this level. Valid values: `log`, `info`, `warning`, `error`, `debug`. If the level is invalid, return an error listing valid options.
- `--keep` — return entries but do not clear the buffer afterwards.

### Output format

```
[ERROR] Uncaught TypeError: Cannot read properties of undefined (reading 'userId')
        at https://staging.example.com/static/js/app.js:47:12

[WARNING] Deprecation: componentWillMount has been renamed
          at https://staging.example.com/static/js/vendor.js:1203:8

[LOG] User loaded: admin@example.com
```

Each entry is formatted as `[LEVEL] text` with location on a continuation line (indented). Level is uppercased.

If no messages, return: `"No console messages."`.

### Drain-and-clear behaviour

1. Copy the current buffer (optionally filtered by `--level`).
2. Unless `--keep` is set, clear the buffer.
3. Format and return the copied entries.

This means the agent sees each message exactly once by default, making it easy to correlate messages with actions: do something → `browse console` → see only the messages from that action.

---

## Network Command (`network.ts`)

Captures failed HTTP requests (4xx and 5xx responses). Same drain-and-clear model as console.

### Usage

```
browse network                → failed requests since last call, then clears buffer
browse network --all          → all requests (not just failures), then clears buffer
browse network --keep         → failed requests since last call, preserves buffer
```

### Network buffer

On daemon startup, attach a listener:

```ts
page.on("response", (response) => {
  networkBuffer.push({
    status: response.status(),
    method: response.request().method(),
    url: response.url(),
    timestamp: Date.now(),
  });
});
```

Buffer entries:

```ts
type NetworkEntry = {
  status: number;
  method: string;
  url: string;
  timestamp: number;
};
```

By default, only entries with `status >= 400` are stored. When `--all` is used, the command returns from a separate unfiltered buffer that captures every response.

**Revised approach:** Always capture all responses to the buffer. Filter at read time:

- Default: return entries where `status >= 400`.
- `--all`: return all entries.

This avoids needing two buffers. Same 500-entry ring buffer cap as console.

### Argument parsing

- `--all` — include all requests, not just failures.
- `--keep` — return entries but do not clear the buffer.

### Output format

```
[404] GET https://staging.example.com/api/users/999
[500] POST https://staging.example.com/api/settings
```

With `--all`, successful requests are also shown:

```
[200] GET https://staging.example.com/api/users
[200] GET https://staging.example.com/api/roles
[404] GET https://staging.example.com/api/users/999
[500] POST https://staging.example.com/api/settings
```

If no matching requests, return: `"No failed requests."` (or `"No requests."` with `--all`).

---

## Shared Buffer Logic (`buffers.ts`)

Both console and network use the same ring buffer pattern. Extract a generic implementation:

```ts
class RingBuffer<T> {
  private items: T[] = [];
  private capacity: number;

  constructor(capacity: number = 500) {
    this.capacity = capacity;
  }

  push(item: T): void {
    if (this.items.length >= this.capacity) {
      this.items.shift();
    }
    this.items.push(item);
  }

  drain(filter?: (item: T) => boolean): T[] {
    const result = filter ? this.items.filter(filter) : [...this.items];
    this.items = [];
    return result;
  }

  peek(filter?: (item: T) => boolean): T[] {
    return filter ? this.items.filter(filter) : [...this.items];
  }

  clear(): void {
    this.items = [];
  }
}
```

- `drain()` returns and clears (default behaviour).
- `peek()` returns without clearing (used with `--keep`).
- `clear()` empties without returning (for future use).

---

## Listener Lifecycle

Console and network listeners must be attached to the active page. Two concerns:

### Page changes

When `goto` navigates the existing page, listeners on `page` remain active — no action needed.

### Tab management (future Phase 3)

When tab support is added, each new page will need its own listeners. For now, listeners are attached once to the single default page during daemon startup. Phase 3 will need to hook into tab creation to attach listeners to new pages.

### Daemon restart

Buffers are in-memory only. A daemon restart clears all history. This is acceptable — the agent is not expected to look at console output from a previous daemon session.

---

## CLI Argument Parsing Updates

The new commands follow the same positional pattern as Phase 0–1, with simple flag support matching Phase 1's approach:

```
browse screenshot                          → cmd: "screenshot", args: []
browse screenshot /tmp/page.png            → cmd: "screenshot", args: ["/tmp/page.png"]
browse screenshot --viewport               → cmd: "screenshot", args: ["--viewport"]
browse screenshot --selector ".header"     → cmd: "screenshot", args: ["--selector", ".header"]
browse console                             → cmd: "console",    args: []
browse console --level error               → cmd: "console",    args: ["--level", "error"]
browse console --keep                      → cmd: "console",    args: ["--keep"]
browse network                             → cmd: "network",    args: []
browse network --all                       → cmd: "network",    args: ["--all"]
```

No changes to the argument parsing approach — same simple string matching on known flags per command.

---

## Testing Strategy

### Unit tests

- **Ring buffer:** Push at capacity wraps correctly, drain returns and clears, peek returns without clearing, filter works correctly.
- **Screenshot argument parsing:** Correctly identifies output path vs flags, rejects `--viewport` + `--selector` together, handles missing selector value.
- **Console formatting:** Entries format correctly with level, text, and location. Level filtering works. Empty buffer returns "No console messages."
- **Network formatting:** Entries format correctly with status, method, URL. Default filters to 4xx/5xx. `--all` includes everything. Empty buffer returns appropriate message.

### Integration tests

Spin up a local test server with known content. The test server should:

- Serve a page with JS that logs to console (`console.log`, `console.error`).
- Have a route that returns 404 and a route that returns 500.
- Have a page with a known visual layout for screenshot comparison.

**Screenshot tests:**

- `goto` test page → `screenshot` → verify PNG file exists at the returned path and is non-empty.
- `screenshot --viewport` → verify file exists.
- `screenshot --selector "h1"` → verify file exists and is smaller than full-page screenshot.
- `screenshot --selector ".nonexistent"` → verify error response.
- `screenshot /tmp/browse-test-screenshot.png` → verify file at exact path.

**Console tests:**

- `goto` test page (triggers console.log and console.error) → `console` → verify output contains the expected messages.
- Call `console` again → verify `"No console messages."` (buffer was drained).
- `goto` test page → `console --level error` → verify only error-level messages returned.
- `goto` test page → `console --keep` → call `console` again → verify messages still present.

**Network tests:**

- `goto` test page (which fetches a 404 and 500 endpoint via JS) → `network` → verify the failed requests appear.
- Call `network` again → verify `"No failed requests."` (buffer was drained).
- `goto` test page → `network --all` → verify 200s also appear.
- `goto` test page → `network --keep` → call `network` again → verify entries still present.

### Test fixtures

Extend the test fixture from Phase 1 (`test/fixtures/`) with:

- `console-test.html` — page that logs messages at various levels on load.
- A test server route `/api/missing` that returns 404 and `/api/error` that returns 500.
- `console-test.html` should fetch these endpoints on load to populate the network buffer.

---

## Acceptance Criteria

1. `browse screenshot` captures a full-page PNG and returns the file path.
2. `browse screenshot <path>` saves to the specified path.
3. `browse screenshot --viewport` captures viewport only (no scroll).
4. `browse screenshot --selector <sel>` captures a specific element.
5. Missing selector target returns a clear error.
6. `browse console` returns formatted console messages since the last call, then clears the buffer.
7. `browse console --level error` filters to error-level messages only.
8. `browse console --keep` returns messages without clearing the buffer.
9. `browse network` returns failed requests (4xx/5xx) since the last call, then clears the buffer.
10. `browse network --all` includes all requests, not just failures.
11. `browse network --keep` returns entries without clearing the buffer.
12. Console and network buffers cap at 500 entries (oldest dropped on overflow).
13. All commands return human-readable output, not raw JSON.
14. Screenshot, console, and network work correctly in combination with Phase 0–1 commands (goto, snapshot, click, fill, select).

---

## Resolved Questions

1. **Screenshot output path** — Optional. Auto-generated by default under `~/.bun-browse/screenshots/` with millisecond-precision timestamps. Explicit path supported as first positional arg.
2. **Console buffer model** — Drain-and-clear by default. Each call returns messages since the last call, then clears. `--keep` flag overrides to preserve the buffer. This keeps token cost low and makes it easy to correlate messages with actions.
3. **Network command scope** — Included as a full deliverable, not a stretch goal. The implementation cost is low (same buffer pattern as console) and the QA value is high — server-side failures that don't surface as console errors are a significant blind spot without it.
4. **Buffer capacity** — 500 entries for both console and network. Enough for any reasonable page interaction session, bounded enough to prevent memory issues on noisy pages.
5. **Full-page screenshot height cap** — 16,384px. Pages taller than this fall back to viewport-only with a note in the response. This prevents OOM on infinitely-scrolling pages.
6. **Listener lifecycle** — Attached once to the default page on daemon startup. Phase 3 (tab management) will need to attach listeners on tab creation.
