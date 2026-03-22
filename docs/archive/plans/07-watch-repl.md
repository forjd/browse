# Plan 07: Watch Mode & Interactive REPL

**Priority:** Tier 2 — Medium Impact
**Personas:** E2E Test Framework Author, Frontend Developer, QA Engineer
**New commands:** `watch`, `repl`

---

## Problem

Every browse command is fire-and-forget from the shell. There's no way to interactively explore a page (REPL) or automatically re-run tests when flow files change (watch mode). Competing tools like Playwright have `--ui` mode and Cypress has interactive runner.

## Design

### `browse repl` — Interactive REPL

```bash
browse repl [url]
```

Starts an interactive session with:
- Command prompt with history (readline)
- Tab completion for commands and flags
- Auto-snapshot after navigation (always shows current interactive elements)
- Inline display of results
- Session persists until `exit` or Ctrl+D

```
browse> goto https://staging.example.com
Navigated to https://staging.example.com (200)

browse> snapshot
@e1 [link] "Dashboard"
@e2 [link] "Users"
@e3 [button] "Create New"

browse> click @e3
Clicked "Create New" [button]

browse> snapshot
@e1 [input] "Name"
@e2 [input] "Email"
@e3 [button] "Save"

browse> fill @e1 "Test User"
Filled "Name" with "Test User"

browse> .save my-flow.json
✓ Saved session history as flow (6 steps) → my-flow.json

browse> exit
```

#### REPL-specific commands (dot-prefix):

| Command | Description |
|---------|-------------|
| `.save <path>` | Export command history as a flow file |
| `.history` | Show command history |
| `.clear` | Clear screen |
| `.undo` | Navigate back (undo last navigation/action) |
| `.auto-snapshot [on\|off]` | Toggle auto-snapshot after navigation |

#### Implementation

**File:** `src/commands/repl.ts` (~250 lines)
**File:** `src/repl-session.ts` (~300 lines)

1. **REPL loop**:
   - Use Node's `readline` module (available in Bun) with history support
   - Custom completer function: complete command names, flags, and `@ref` identifiers
   - Parse input → dispatch to daemon handlers directly (no socket overhead)
   - Collect command history for `.save`

2. **Tab completion**:
   - First word: complete against command list
   - After `@`: complete against current ref map
   - After `--`: complete against known flags for current command

3. **Auto-snapshot**:
   - After commands that trigger navigation (`goto`, `click`, `back`, `forward`, `reload`), automatically run `snapshot` and display results
   - Togglable via `.auto-snapshot off`

4. **`.save` export**:
   - Filter history to action commands (skip `snapshot`, `screenshot`, `.` commands)
   - Convert to flow format (same as `record` output from Plan 01)
   - Write to file

### `browse watch` — File Watch Mode

```bash
# Watch a specific flow file
browse watch my-flow.flow.json [--var base_url=https://staging.example.com]

# Watch with reporter
browse watch my-flow.flow.json --reporter markdown

# Watch browse.config.json (re-run healthcheck on change)
browse watch --healthcheck
```

On each file change:
1. Clear previous results
2. Re-run the flow
3. Print results with pass/fail
4. Wait for next change

#### Implementation

**File:** `src/commands/watch.ts` (~150 lines)

1. **File watching**:
   - Use `Bun.file().watch()` or `fs.watch()` for file change detection
   - Debounce: 300ms after last change before re-running (handles rapid saves)

2. **Execution**:
   - On change: invoke `handleFlow` or `handleHealthcheck` directly
   - Print separator + timestamp between runs
   - Show execution time

3. **Output**:
   ```
   [10:32:15] File changed: my-flow.flow.json
   Running flow "my-flow"...
   ✓ Step 1/5: goto → Navigated
   ✓ Step 2/5: fill → Filled fields
   ✓ Step 3/5: click → Clicked "Submit"
   ✗ Step 4/5: assert text-contains "Success" → FAILED: text not found
   ✓ Step 5/5: screenshot → Saved

   Result: 4/5 passed (1 failed) — 2.3s
   Watching for changes... (Ctrl+C to stop)
   ```

4. **Smart re-run**:
   - If `browse.config.json` changes, reload config before re-running
   - If a flow file changes, only re-run that flow (not all flows)

## Testing

**File:** `test/repl.test.ts`

- Test command parsing in REPL context
- Test tab completion logic
- Test `.save` export format
- Test auto-snapshot toggle

**File:** `test/watch.test.ts`

- Test debounce logic
- Test flow re-execution on file change
- Test config reload

## Dependencies

- `readline` (built into Bun/Node)
- `fs.watch` (built into Bun/Node)
- No new npm dependencies

## Estimated Scope

- `src/commands/repl.ts` — ~250 lines
- `src/repl-session.ts` — ~300 lines
- `src/commands/watch.ts` — ~150 lines
- `test/repl.test.ts` — ~150 lines
- `test/watch.test.ts` — ~100 lines
- Help, protocol, daemon wiring — ~60 lines
