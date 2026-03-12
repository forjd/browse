# Phase 5 — Skill File and Integration

**Goal:** Claude Code can use the tool effectively via a SKILL.md file. Any developer on the team can clone the repo, run `./setup`, and immediately use `browse` commands.

**Prerequisite:** Phase 4 (domain-specific commands) — see `phase-4-domain-commands.md`.

---

## File Structure (additions to Phase 4)

```
SKILL.md            # Skill file — command reference + methodology guide for Claude Code
setup.sh            # Idempotent setup script — install browsers, compile, symlink
```

No new `src/` files. This phase is documentation and tooling, not runtime code.

---

## SKILL.md

The skill file is the primary reference that tells Claude Code how to use `browse`. It ships in the project root alongside the binary. It is freeform markdown structured as a command reference and methodology guide.

### Structure

The skill file is organised into these sections:

#### 1. Overview

- What the tool does (one paragraph).
- How it works (daemon model, Unix socket, persistent session state).
- When to use it (QA verification, visual checks, form interaction, auth testing).

#### 2. Quick start

- How to start: just run any command — the daemon cold-starts automatically.
- How to stop: `browse quit`.
- First useful sequence: `browse goto <url>` → `browse snapshot` → `browse screenshot`.

#### 3. Command reference

Every command with exact syntax, arguments, flags, and example output. Organised by phase/capability:

**Navigation and content:**
```
browse goto <url>                          Navigate to URL, returns page title
browse text                                Returns visible text content
browse quit                                Shuts down the daemon
```

**Snapshot and interaction (ref system):**
```
browse snapshot                            Interactive elements with refs (@e1, @e2, ...)
browse snapshot -i                         Include structural elements (headings, text)
browse snapshot -f                         Full accessibility tree dump
browse click @eN                           Click element by ref
browse fill @eN "value"                    Fill input by ref
browse select @eN "option"                 Select dropdown option by ref
```

**Visual and debugging:**
```
browse screenshot [path]                   Full-page screenshot (auto-path if omitted)
browse screenshot --viewport               Viewport only (no scroll)
browse screenshot --selector "css"         Element-level screenshot
browse console                             Console messages since last call (drains buffer)
browse console --level error               Errors only
browse console --keep                      Return without clearing buffer
browse network                             Failed requests (4xx/5xx) since last call
browse network --all                       All requests including successful
browse network --keep                      Return without clearing buffer
```

**Auth and session:**
```
browse auth-state save <path>              Export cookies + localStorage to file
browse auth-state load <path>              Restore session from file
browse login --env <name>                  Automated login via configured environment
browse tab list                            Show open tabs
browse tab new [url]                       Open new tab
browse tab switch <index>                  Switch to tab (1-based)
browse tab close [index]                   Close tab
```

**Flows and assertions:**
```
browse flow list                           List configured flows
browse flow <name> --var key=value         Execute a named flow
browse assert visible <selector>           Assert element is visible
browse assert text-contains <text>         Assert page contains text
browse assert url-contains <substring>     Assert URL contains string
browse assert permission <name> granted|denied   Check permission via config
browse healthcheck --var base_url=<url>    Run healthcheck across configured pages
```

#### 4. The ref system

How refs work — this is the most important concept for the agent to understand:

- **Always snapshot before interacting.** Refs are assigned by `browse snapshot` and are the only way to target elements.
- **Refs are ephemeral.** They regenerate on every `snapshot` call. Old refs are invalid.
- **Refs go stale after navigation.** Any `goto` or click that triggers navigation invalidates refs. The tool returns a clear error — just run `snapshot` again.
- **Ref format:** `@e1`, `@e2`, etc. Sequential, depth-first order.
- **Typical interaction loop:** `snapshot` → read refs → `click @eN` or `fill @eN "value"` → `snapshot` again if the page changed.

#### 5. QA methodology

The recommended approach for a QA pass. This is the high-level workflow the agent should follow:

1. **Navigate:** `browse goto <url>`.
2. **Observe:** `browse snapshot` to see page structure. `browse screenshot` for visual state.
3. **Check for errors:** `browse console --level error` after every navigation.
4. **Interact:** `browse fill`, `browse click`, `browse select` to exercise forms and flows.
5. **Verify:** `browse snapshot` or `browse screenshot` after each interaction to confirm the expected result.
6. **Repeat:** Move through the application's pages and flows.

For configured applications, use `browse healthcheck` first to get a quick pass/fail across key pages, then drill into failures.

#### 6. Authentication

- **Preferred:** `browse login --env <name>` if the environment is configured in `browse.config.json`.
- **Manual:** `browse goto <login-url>` → `browse snapshot` → `browse fill @eN "user"` → `browse fill @eM "pass"` → `browse click @eK`.
- **Reuse sessions:** `browse auth-state save /tmp/auth.json` after login. `browse auth-state load /tmp/auth.json` in future sessions.

#### 7. Common failure patterns and recovery

| Symptom | Cause | Fix |
|---------|-------|-----|
| `"Refs are stale"` | Page changed since last snapshot | Run `browse snapshot` |
| `"Unknown ref: @e7"` | Ref doesn't exist in current snapshot | Run `browse snapshot` to see available refs |
| `"Daemon connection lost"` | Daemon crashed or was killed | Just run the command again — CLI auto-restarts the daemon |
| `"Command timed out"` | Page is slow or unresponsive | Check URL is correct, check network connectivity |
| `"No element matching selector"` | CSS selector is wrong | Check the selector on the page, use `browse snapshot -f` for structure |
| Login fails | Credentials missing or wrong | Check env vars, verify login URL, use `browse screenshot` to see the page |

#### 8. Configuration

Brief reference for `browse.config.json` — point to the project docs for the full schema. Cover:

- Environment definitions (login).
- Flow definitions.
- Permission mappings.
- Healthcheck page list.

---

## CLAUDE.md Integration

Add a section to the project's `CLAUDE.md` that registers the skill and tells Claude Code to prefer it over any MCP browser tools.

### Content to add

```markdown
## Browse — Browser QA Tool

This project includes `browse`, a CLI tool for AI-agent-driven browser automation.

- **Skill file:** See `SKILL.md` for the full command reference and QA methodology.
- **Binary:** `dist/browse` (compile with `./setup.sh`).
- **Prefer this tool** over any MCP browser tools for QA tasks against this project's application.
- The tool manages its own daemon — just run commands directly.
```

This is deliberately minimal. The `SKILL.md` carries the detail. The `CLAUDE.md` section exists to:

1. Make Claude Code aware the tool exists.
2. Establish preference over alternative browser tools.
3. Point to the skill file for details.

---

## Setup Script (`setup.sh`)

An idempotent shell script that prepares the tool for use. Safe to run repeatedly.

### Usage

```bash
./setup.sh
```

### Steps

1. **Check prerequisites:**
   - Verify `bun` is installed and on PATH. If missing, print a clear error with install instructions (`curl -fsSL https://bun.sh/install | bash`) and exit 1.
   - Verify `bun` version is >= 1.0. If too old, print version found and required version, exit 1.

2. **Install dependencies:**
   - Run `bun install` to install `package.json` dependencies (Playwright).

3. **Install Playwright browsers:**
   - Run `bunx playwright install chromium`.
   - This downloads the Chromium binary Playwright needs. Idempotent — skips if already installed.

4. **Compile the binary:**
   - Detect platform and architecture:
     ```bash
     OS=$(uname -s)    # Darwin or Linux
     ARCH=$(uname -m)  # x86_64 or arm64/aarch64
     ```
   - Run `bun build --compile ./src/cli.ts --outfile dist/browse`.
   - Bun compiles for the current platform by default — no cross-compilation flags needed.
   - Verify the binary was created and is executable.

5. **Create symlink:**
   - Target: `~/.local/bin/browse`.
   - Create `~/.local/bin/` if it doesn't exist.
   - If `~/.local/bin/browse` already exists (from a previous install), remove it before creating the new symlink.
   - Print a note if `~/.local/bin` is not on PATH, with instructions to add it:
     ```
     Note: ~/.local/bin is not on your PATH. Add it with:
       export PATH="$HOME/.local/bin:$PATH"
     Add this to your shell profile (~/.zshrc or ~/.bashrc) to make it permanent.
     ```

6. **Verify:**
   - Run `browse --version` (or a simple command) to confirm the binary works.
   - Print success message with the binary path.

### Output

```
[1/5] Checking prerequisites...
  ✓ bun 1.1.42

[2/5] Installing dependencies...
  ✓ Dependencies installed

[3/5] Installing Playwright browsers...
  ✓ Chromium installed

[4/5] Compiling binary...
  ✓ dist/browse (darwin-arm64)

[5/5] Creating symlink...
  ✓ ~/.local/bin/browse → /Users/dan/Projects/bun-browser/dist/browse

Setup complete. Run 'browse goto https://example.com' to get started.
```

### Idempotency

Every step is safe to re-run:

- `bun install` is idempotent.
- `bunx playwright install chromium` skips if already present.
- `bun build --compile` overwrites the previous binary.
- Symlink is removed and recreated.
- No global state is modified beyond `~/.local/bin/browse`.

### Error handling

- Each step checks for success before proceeding.
- On failure, print what went wrong and stop — don't continue with a broken state.
- Common failures and their messages:
  - `bun` not found: `"Error: bun is not installed. Install it with: curl -fsSL https://bun.sh/install | bash"`.
  - `bun build` fails: `"Error: Compilation failed. Check the output above for details."`.
  - Playwright install fails: `"Error: Failed to install Chromium. Check network connectivity and try again."`.

### Platform support

| OS | Architecture | Supported |
|----|-------------|-----------|
| macOS | arm64 (Apple Silicon) | Yes |
| macOS | x86_64 (Intel) | Yes |
| Linux | x86_64 | Yes |
| Linux | arm64/aarch64 | Yes |

Bun handles platform-specific compilation automatically. The setup script only needs to detect the platform for the success message — no conditional logic per platform.

---

## Testing Strategy

### Setup script tests

The setup script is tested manually and via CI. No unit tests — it's a straightforward shell script.

**Manual smoke test:**

1. Clone the repo on a clean machine (or in a fresh container).
2. Run `./setup.sh`.
3. Verify `browse goto https://example.com` returns the page title.
4. Run `./setup.sh` again — verify it completes without errors (idempotency).

**CI tests:**

- Run `./setup.sh` on both macOS and Linux runners.
- Verify the binary is created at `dist/browse`.
- Run a basic command to verify the binary works.

### SKILL.md validation

No automated tests for the skill file content — it's documentation. Validation is:

1. **Completeness:** Every command from Phases 0–4 is documented with exact syntax.
2. **Accuracy:** Example outputs match the actual tool behaviour.
3. **Methodology:** The QA workflow section is actionable and covers the common patterns.

Validation approach: after all phases are implemented, run through the SKILL.md examples against a live application and verify outputs match.

### Integration test

End-to-end validation that the skill file works with Claude Code:

1. Set up a local test application.
2. Run `./setup.sh`.
3. Give Claude Code a QA task against the test application.
4. Verify the agent uses `browse` commands correctly, following the methodology in SKILL.md.

This is a manual acceptance test, not an automated one. The value is confirming the skill file is clear enough for the agent to work autonomously.

---

## Acceptance Criteria

1. `SKILL.md` documents every command from Phases 0–4 with exact syntax, arguments, flags, and example output.
2. `SKILL.md` explains the ref system clearly enough that the agent always snapshots before interacting.
3. `SKILL.md` includes a QA methodology section with a step-by-step workflow.
4. `SKILL.md` covers authentication approaches (configured login, manual flow, session reuse).
5. `SKILL.md` includes a failure recovery table for common error patterns.
6. `SKILL.md` documents `browse.config.json` structure at a reference level.
7. `CLAUDE.md` includes a section that registers the tool and establishes preference over MCP browser tools.
8. `./setup.sh` is idempotent — safe to run repeatedly with no side effects.
9. `./setup.sh` checks for `bun` and exits with a clear error if missing.
10. `./setup.sh` installs dependencies, Playwright browsers, compiles the binary, and creates a symlink.
11. `./setup.sh` prints a note if `~/.local/bin` is not on PATH.
12. `./setup.sh` works on macOS (arm64, x86_64) and Linux (x86_64, arm64).
13. After running `./setup.sh`, `browse goto https://example.com` works from any directory.
14. The compiled binary at `dist/browse` is self-contained — no runtime dependency on Bun or the source tree (except for Playwright's Chromium, which is installed separately).

---

## Resolved Questions

1. **SKILL.md vs CLAUDE.md** — `SKILL.md` is the primary reference with the full command documentation and methodology. `CLAUDE.md` gets a short section that registers the tool and points to the skill file. This keeps the skill portable and avoids duplicating content.
2. **Setup script language** — Plain shell script (`setup.sh`). It only needs to run `bun install`, `bunx playwright install chromium`, `bun build --compile`, and create a symlink. No need for Bun or any other runtime here since the script's job is to bootstrap the environment.
3. **Symlink location** — `~/.local/bin/browse` as default. Standard user-local bin directory, no sudo required. The script prints a note if the directory isn't on PATH.
4. **SKILL.md format** — Freeform markdown structured as a command reference + methodology guide. Claude Code doesn't enforce a skill file schema — the value is in the content being clear and complete enough that the agent can use the tool without additional prompting.
5. **Platform support** — macOS + Linux, x86_64 + arm64. Bun supports all four combinations and the detection logic is trivial (`uname -s` / `uname -m`).
6. **Auto-installing Bun** — No. The setup script errors with a clear message and install instructions if Bun is missing. Auto-installing a runtime is surprising behaviour and could conflict with version managers.
