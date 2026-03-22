# Plan 01: Interactive Test Recorder

**Priority:** Tier 1 — High Impact
**Personas:** QA Engineer, Product Manager, Freelancer, Technical Writer
**New commands:** `record start`, `record stop`, `record pause`, `record resume`

---

## Problem

Flows must be hand-written as JSON in `browse.config.json`. Non-technical users can't create them, and even experienced engineers find it tedious to manually construct step sequences. Every competing tool (Playwright Codegen, Cypress Studio, Chrome Recorder) offers a record-and-replay workflow.

## Design

### Architecture

```
┌─ Headed Browser ─────────────────────────────┐
│  User clicks, types, navigates normally       │
│                                               │
│  Injected observer script captures:           │
│  - click events → target element ref/selector │
│  - input events → field + value               │
│  - navigation events → URL changes            │
│  - select changes → option selected           │
└──────────────┬────────────────────────────────┘
               │ CDP events + page.evaluate()
               ▼
┌─ Daemon ─────────────────────────────────────┐
│  RecordingSession accumulates steps[]         │
│  Maps DOM events to flow step types           │
│  Deduplicates rapid-fire input events         │
│  Resolves targets to accessibility names      │
└──────────────┬────────────────────────────────┘
               │ record stop
               ▼
         .flow.json file
```

### Commands

```bash
# Start recording (forces headed mode)
browse record start [--output flow.json] [--name "my-flow"]

# Pause/resume (for setup actions you don't want recorded)
browse record pause
browse record resume

# Stop and save
browse record stop
```

### Step Mapping

| Browser Event | Flow Step |
|--------------|-----------|
| Page navigation | `{ "goto": "<url>" }` |
| Click on element | `{ "click": "<accessible-name-or-role>" }` |
| Type into input | `{ "fill": { "<field-name>": "<value>" } }` |
| Select dropdown option | `{ "select": { "<field-name>": "<option>" } }` |
| File upload | `{ "upload": { "<field-name>": "<path>" } }` |
| Scroll to bottom | `{ "scroll": "down" }` |
| Dialog accept/dismiss | `{ "dialog": "accept" }` or `{ "dialog": "dismiss" }` |

### Implementation

**File:** `src/commands/record.ts`

1. **`record start`**:
   - If daemon is headless, restart in headed mode (or error with guidance)
   - Create a `RecordingSession` that attaches CDP event listeners:
     - `Page.frameNavigated` → capture goto steps
     - Inject a MutationObserver + event listener script via `page.addInitScript()` that sends back user interactions via `window.__browseRecorder.emit(event)`
   - Use `page.exposeFunction('__browseRecorderEmit', callback)` to receive events in Node
   - Store steps in an in-memory array on the daemon

2. **`record stop`**:
   - Detach all listeners and remove injected scripts
   - Post-process steps:
     - Collapse sequential `fill` events on the same field into one step
     - Convert absolute URLs to `{{base_url}}` variables where possible
     - Detect login patterns and suggest `login` step substitution
   - Write output as a valid flow definition (JSON)
   - Print path to saved file

3. **`record pause` / `record resume`**:
   - Toggle event capture without removing listeners (avoids re-injection cost)

**Element targeting strategy:**
- Prefer accessible name (`getByRole('button', { name: 'Submit' })`)
- Fall back to `aria-label`, `placeholder`, `data-testid`
- Last resort: CSS selector (with warning in output)

### Output Format

```json
{
  "name": "recorded-flow-2026-03-22",
  "variables": ["base_url"],
  "steps": [
    { "goto": "{{base_url}}/login" },
    { "fill": { "Email": "admin@example.com", "Password": "secret" } },
    { "click": "Sign in" },
    { "wait": { "urlContains": "/dashboard" } },
    { "screenshot": true }
  ]
}
```

### Post-Recording Enhancement

After saving, print suggestions:
```
✓ Saved 8 steps to my-flow.flow.json
  Suggestions:
  - Steps 2-4 look like a login sequence → consider replacing with { "login": "staging" }
  - Step 2 contains literal credentials → consider using variables
  - Add assertions to verify expected state after key actions
```

## Testing

**File:** `test/record.test.ts`

- Mock `page.exposeFunction` and `page.addInitScript`
- Simulate a sequence of recorder events (navigate, click, fill, navigate)
- Verify output JSON matches expected flow structure
- Test step deduplication (rapid keystrokes → single fill)
- Test pause/resume toggle

## Dependencies

- Requires headed mode (`BROWSE_HEADED=1`)
- No new npm dependencies — uses existing Playwright CDP APIs

## Estimated Scope

- `src/commands/record.ts` — ~300 lines
- `src/recorder.ts` (session + event processing) — ~400 lines
- `test/record.test.ts` — ~200 lines
- Help text, protocol, daemon wiring — ~50 lines
