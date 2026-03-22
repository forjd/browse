# Plan 04: Natural Language Command Interface

**Priority:** Tier 1 — High Impact
**Personas:** Product Manager, Technical Writer, Freelancer
**New commands:** `do`

---

## Problem

Non-technical users can't memorize `snapshot`, `@ref`, `click`, `fill` sequences. They want to describe what they want in plain English and have `browse` figure out the commands. The `assert-ai` command proves the LLM integration pattern works — this extends it to all actions.

## Design

### Command Interface

```bash
# Simple actions
browse do "go to https://staging.example.com and take a screenshot"

# Multi-step flows
browse do "log in as admin, go to the users page, and check there are at least 5 users"

# With environment context
browse do "log in to staging and verify the dashboard loads" --env staging

# Dry run — show commands without executing
browse do "fill the search box with 'test' and press enter" --dry-run

# Specify provider/model
browse do "check that the header shows the user's name" --provider anthropic --model claude-sonnet-4-6
```

### Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--dry-run` | Print generated commands without executing | `false` |
| `--env <name>` | Environment for login context | none |
| `--provider <name>` | LLM provider (anthropic, openai) | from config |
| `--model <name>` | Model to use | provider default |
| `--verbose` | Show each command as it executes | `false` |

### Architecture

```
"log in as admin and check the dashboard"
       │
       ▼
┌─ LLM Planner ─────────────────────────────┐
│  System prompt: available commands, current │
│  page state (URL, snapshot), config context │
│                                             │
│  Output: ordered list of browse commands    │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─ Command Executor ─────────────────────────┐
│  Execute each command sequentially          │
│  After each: check for errors, update state │
│  If command fails: send error back to LLM   │
│  for corrective action                      │
└──────────────┬──────────────────────────────┘
               │
               ▼
         Summary output
```

### Implementation

**File:** `src/commands/do.ts` (~150 lines)
**File:** `src/nl-planner.ts` (~300 lines)

1. **System Prompt Construction**:
   - List all available browse commands with one-line descriptions
   - Include current page state: URL, truncated snapshot (top 30 interactive elements)
   - Include available environments from config (for login commands)
   - Include available flows from config (the LLM can invoke them)
   - Instruction: "Output a JSON array of browse commands to achieve the user's goal"

2. **LLM Call**:
   - Reuse the provider abstraction from `assert-ai` (`src/commands/assert-ai.ts`)
   - Support Anthropic and OpenAI providers
   - Send system prompt + user's natural language instruction
   - Parse response as JSON array of command strings

3. **Command Execution Loop**:
   - For each generated command:
     - Parse into `{ cmd, args }` (same as CLI parser)
     - Execute via internal daemon dispatch (not socket — direct function call)
     - Collect result
     - If error: send error + current state back to LLM for one retry/correction
   - After all commands: compile summary

4. **Dry-Run Mode**:
   - Run only the LLM planning step
   - Print generated commands as a numbered list
   - User can review, then run manually or re-invoke without `--dry-run`

5. **Output**:
   ```
   ✓ Step 1: login --env staging → Logged in as admin@example.com
   ✓ Step 2: goto https://staging.example.com/dashboard → Navigated
   ✓ Step 3: snapshot → 12 interactive elements found
   ✓ Step 4: assert text-contains "Dashboard" → Passed

   Done: 4/4 steps succeeded.
   ```

### LLM Response Format

```json
[
  "login --env staging",
  "goto https://staging.example.com/dashboard",
  "snapshot",
  "assert text-contains \"Dashboard\""
]
```

### Safety

- **No destructive commands**: The planner prompt explicitly excludes `quit`, `wipe`, `record`
- **Max steps**: Cap at 20 steps per `do` invocation to prevent runaway loops
- **Cost awareness**: Print token usage at end if `--verbose`
- **Confirmation for side effects**: If LLM generates `fill` or `click` with values that look like they'd submit data, warn in `--dry-run`

### Error Recovery

When a command fails, send this to the LLM:
```
Command "click Submit" failed with: "No element with accessible name 'Submit' found"
Current page snapshot: [truncated snapshot]
Remaining goal: "submit the form"
What command should I try instead?
```

The LLM gets one retry attempt per failed step. If retry also fails, skip and report.

## Testing

**File:** `test/do.test.ts`

- Mock LLM provider to return canned command sequences
- Test command parsing and execution loop
- Test error recovery (mock a failing command, verify retry prompt)
- Test dry-run output format
- Test max-step cap
- Test system prompt includes current page state

## Dependencies

- Requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (same as `assert-ai`)
- No new npm dependencies — reuses existing AI provider abstraction

## Estimated Scope

- `src/commands/do.ts` — ~150 lines
- `src/nl-planner.ts` — ~300 lines
- `test/do.test.ts` — ~200 lines
- Help, protocol, daemon wiring — ~50 lines
