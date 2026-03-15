# Development Guide

Contributing guide for the `browse` CLI tool.

## Prerequisites

- [Bun](https://bun.sh) >= 1.0
- Git

## Setup

```sh
git clone https://github.com/forjd/browse.git
cd browse
bun install
bunx playwright install chrome
```

## Project Structure

```
src/
├── cli.ts              # CLI entry point, argument parsing, daemon spawning
├── daemon.ts           # Daemon server, Playwright browser management, command dispatch
├── protocol.ts         # Request/response types, JSON serialisation
├── refs.ts             # Ref system — assignment, staleness, resolution
├── config.ts           # Config file loading and validation (browse.config.json)
├── pool.ts             # Multi-session pool manager (library API)
├── lifecycle.ts        # PID/socket file management, idle timer
├── help.ts             # Command help text and formatting
├── flags.ts            # Flag validation per command
├── timeout.ts          # Timeout wrapper and resolution
├── retry.ts            # Crash recovery with retry logic
├── version.ts          # Version formatter
├── stealth.ts          # Browser fingerprint spoofing
├── buffers.ts          # RingBuffer for console/network logs
├── flow-runner.ts      # Flow execution engine, variable interpolation
└── commands/           # One file per command (43 total)
    ├── a11y.ts
    ├── assert.ts
    ├── attr.ts
    ├── auth-state.ts
    ├── back.ts
    ├── benchmark.ts
    ├── click.ts
    ├── console.ts
    ├── cookies.ts
    ├── dialog.ts
    ├── download.ts
    ├── element-count.ts
    ├── eval.ts
    ├── fill.ts
    ├── flow.ts
    ├── forward.ts
    ├── frame.ts
    ├── goto.ts
    ├── healthcheck.ts
    ├── hover.ts
    ├── html.ts
    ├── intercept.ts
    ├── login.ts
    ├── network.ts
    ├── page-eval.ts
    ├── pdf.ts
    ├── press.ts
    ├── quit.ts
    ├── reload.ts
    ├── screenshot.ts
    ├── scroll.ts
    ├── select.ts
    ├── session.ts
    ├── snapshot.ts
    ├── storage.ts
    ├── tab.ts
    ├── text.ts
    ├── title.ts
    ├── upload.ts
    ├── url.ts
    ├── viewport.ts
    ├── wait.ts
    └── wipe.ts
test/
├── *.test.ts           # Unit/integration tests
├── unit/               # Isolated unit tests
├── integration/        # Integration test suites
├── integration.ts      # Standalone integration tests
└── fixtures/           # Test data
```

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Lint + format | `bun run check:fix` | Auto-fix lint and formatting issues (Biome) |
| Lint only | `bun run lint` | Check for lint errors |
| Format only | `bun run format` | Auto-format code |
| Check | `bun run check` | Check lint + format without fixing |
| Test | `bun test` | Run all tests |
| Integration | `bun run test:integration` | Run standalone integration tests |
| Build | `bun run build` | Compile binary to dist/browse |
| Full setup | `./setup.sh` | Install deps, Chromium, build, and symlink |

## Code Style

- **Formatter**: Biome with tabs and double quotes
- **Linter**: Biome recommended rules
- **Imports**: Organised automatically by Biome
- **Git hooks**: lefthook runs `biome check` pre-commit
- Always run `bun run check:fix` before committing

## Testing

- Test framework: Bun's built-in test runner (`bun test`)
- Tests in `test/` directory
- Integration tests spawn isolated daemon instances with unique socket/PID paths
- Test pattern: create daemon deps, exercise handler, assert response

```sh
bun test                          # all tests
bun test test/snapshot.test.ts    # single test file
bun run test:integration          # standalone integration
```

## Building

```sh
# Quick build
bun run build

# Full setup (install + build + symlink)
./setup.sh
```

Build compiles `src/cli.ts` into a self-contained binary at `dist/browse` using `bun build --compile`. External dependencies (`electron`, `chromium-bidi`) are excluded.

The setup.sh script also copies the `extensions/screenxy-fix` Chrome extension alongside the binary.

**Important**: Rebuilding does not restart a running daemon. Run `browse quit` first so the next call cold-starts with the new binary.

## Adding a New Command

1. **Create handler**: `src/commands/<name>.ts`
   ```typescript
   import type { Response } from "../protocol.ts";
   import type { Page } from "playwright";

   export async function handleMyCommand(
     page: Page,
     args: string[],
   ): Promise<Response> {
     // Implementation
     return { ok: true, data: "result" };
   }
   ```

2. **Register command**: Add to `VALID_COMMANDS` array in `src/protocol.ts`

3. **Add dispatch**: Add case to the switch in `src/daemon.ts`'s `executeCommand()`

4. **Add known flags**: Add entry to `KNOWN_FLAGS` in `src/daemon.ts` (even if empty `[]`)

5. **Add help text**: Add entry to `COMMANDS` in `src/help.ts` with `summary` and `usage`

6. **Write tests**: Add `test/<name>.test.ts`

7. **Lint**: Run `bun run check:fix`

## Dependencies

| Package | Purpose |
|---------|---------|
| `playwright` (patchright@1.58.2) | Browser automation (Chromium) — patched fork for stealth |
| `@axe-core/playwright` | Accessibility auditing |
| `user-agents` | Random desktop Chrome UA string generation |
| `@biomejs/biome` | Linting and formatting |
| `lefthook` | Git hooks |

## Patched Dependencies

The project uses `patchright` — a Playwright fork with stealth enhancements. Two patches are applied via Bun's `patchedDependencies`:
- `patchright-core@1.58.2`
- `patchright@1.58.2`

## Source Code Reference

Vendored source code for dependencies is available in `opensrc/`. See `opensrc/sources.json` for versions. Use when you need to understand package internals.

To fetch additional source code:

```sh
bunx opensrc <package>           # npm
bunx opensrc pypi:<package>      # Python
bunx opensrc crates:<package>    # Rust
bunx opensrc <owner>/<repo>      # GitHub repo
```

## Further Reading

- [Architecture](architecture.md)
- [Commands Reference](commands.md)
