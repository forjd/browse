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
bun x patchright install chrome
```

## Project Structure

```
src/
├── cli.ts              # CLI entry point, argument parsing, daemon spawning
├── daemon.ts           # Daemon server, Playwright browser management, command dispatch
├── protocol.ts         # Request/response types, JSON serialisation
├── refs.ts             # Ref system — assignment, staleness, resolution
├── config.ts           # Config file loading and validation (browse.config.json)
├── artifacts.ts        # Shared artifact listing, cleanup, and retention helpers
├── pool.ts             # Multi-session pool manager (library API)
├── lifecycle.ts        # PID/socket file management, idle timer
├── auth.ts             # Daemon socket authentication token management
├── help.ts             # Command help text and formatting
├── flags.ts            # Flag validation per command
├── timeout.ts          # Timeout wrapper and resolution
├── retry.ts            # Crash recovery with exponential backoff and circuit breaker
├── version.ts          # Version formatter
├── stealth.ts          # Browser fingerprint spoofing
├── buffers.ts          # RingBuffer for console/network logs
├── flow-runner.ts      # Flow execution engine, variable interpolation, conditionals
├── completions.ts      # Shell completion generators (bash, zsh, fish)
├── reporters.ts        # JUnit XML reporter for CI
├── cdp-accessibility.ts # CDP accessibility tree fetching for full snapshot mode
├── cdp-console.ts      # CDP console message capture
├── visual-diff.ts      # Screenshot visual diff implementation
├── safe-pattern.ts     # Safe regex pattern handling
└── commands/           # One file per command (53 total)
    ├── a11y.ts
    ├── assert-ai.ts      # AI-powered visual assertions
    ├── assert.ts
    ├── attr.ts
    ├── auth-state.ts
    ├── back.ts
    ├── benchmark.ts
    ├── click.ts
    ├── console.ts
    ├── cookies.ts
    ├── dialog.ts
    ├── diff.ts           # Visual diff across deployments
    ├── download.ts
    ├── element-count.ts
    ├── eval.ts
    ├── fill.ts
    ├── flow-share.ts     # Flow sharing (export, import, publish)
    ├── flow.ts
    ├── form.ts           # Bulk form filling
    ├── forward.ts
    ├── frame.ts
    ├── goto.ts
    ├── healthcheck.ts    # --parallel, --concurrency support
    ├── hover.ts
    ├── html.ts
    ├── init.ts           # Config template generator
    ├── intercept.ts
    ├── login.ts
    ├── network.ts
    ├── page-eval.ts
    ├── pdf.ts
    ├── press.ts
    ├── quit.ts
    ├── reload.ts
    ├── replay.ts         # Session replay HTML generator
    ├── report.ts         # HTML report generator
    ├── screenshot.ts
    ├── screenshots.ts    # Screenshot management (list, clean, count)
    ├── scroll.ts
    ├── select.ts
    ├── session.ts
    ├── snapshot.ts
    ├── storage.ts
    ├── tab.ts
    ├── test-matrix.ts    # Multi-role parallel testing
    ├── text.ts
    ├── title.ts
    ├── trace.ts          # Playwright trace recording
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
benchmarks/
├── performance-regression.ts   # Warm-path regression suite with JSON output
├── competitive.ts              # Browse vs Playwright (+ optional Cypress/Selenium)
├── workloads.ts                # Typical QA workflow benchmark runner
└── lib.ts                      # Shared benchmark helpers
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
| Regression benchmarks | `bun run bench:regression` | Run machine-readable warm-path benchmarks |
| Competitive benchmarks | `bun run bench:competitive` | Compare Browse with Playwright and optional external runners |
| Workload benchmarks | `bun run bench:workloads` | Run representative QA workflow timings |
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
bun run bench:regression          # advisory benchmark JSON artifact
```

Benchmark scripts write JSON artifacts under `.benchmarks/` by default. CI uses `.github/workflows/benchmarks.yml` to run the regression and workload suites on every push and pull request, upload the artifacts, and keep the results advisory rather than blocking.

## Building

```sh
# Quick build
bun run build

# Full setup (install + build + symlink)
./setup.sh
```

Build compiles `src/cli.ts` into a self-contained binary at `dist/browse` using `bun build --compile`. External dependencies (`electron`, `chromium-bidi`) are excluded.

The setup.sh script also copies the Chrome extensions (`extensions/screenxy-fix`, `extensions/stealth-worker-fix`) alongside the binary.

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
