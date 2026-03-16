# Feature Gap Analysis — Browse CLI

**Date:** 2026-03-15
**Version analysed:** 0.7.1
**Analyst scope:** Full codebase reconnaissance, source-level review of all 56 source files, 46 test files, 12 documentation pages, CI/CD pipelines, and roadmap.

---

## State of the Project

### What it is

**Browse** is a CLI tool that gives AI coding agents browser automation capabilities. It wraps Playwright behind a persistent daemon architecture, exposing 50+ commands over a Unix socket so that agents (primarily Claude Code) can navigate web applications, inspect the DOM via an accessibility-tree ref system, take screenshots, fill forms, run assertions, and execute multi-step flows — all from the terminal, within the same agentic loop that wrote the code.

### Who it is for

1. **Primary:** AI coding agents (Claude Code) performing post-deployment QA, smoke testing, and visual verification.
2. **Secondary:** Developers who want a scriptable browser CLI for automation tasks without writing Playwright scripts.
3. **Tertiary:** Teams integrating browser-based smoke tests into CI/CD pipelines.

### Maturity level

**Late MVP / Early Production.** All six planned phases are complete. The tool has a comprehensive command surface, thorough documentation, multi-platform CI builds, a release automation pipeline, and 46 test files. It is past prototype stage but has not yet been battle-tested at scale or gained external adoption momentum. The roadmap's "future considerations" are all unimplemented.

### Comparable tools

| Tool | Relationship |
|---|---|
| **Playwright CLI / `npx playwright`** | Lower-level; requires writing scripts. Browse abstracts this into stateful commands. |
| **Cypress** | Full test framework; heavier, not designed for agent-driven use. |
| **Puppeteer** | Library, not CLI. No ref system, no daemon model. |
| **Browser-use (Python)** | AI-agent browser tool, but Python-only, different architecture (LLM-in-the-loop). |
| **Stagehand (Browserbase)** | Cloud-hosted AI browser; different deployment model, no local daemon. |
| **Playwright MCP Server** | MCP-based browser tool for Claude; Browse's most direct competitor for the Claude Code use case. |

Browse's differentiators: single-binary distribution, persistent daemon for sub-200ms warm commands, ARIA-based ref system that avoids CSS selectors entirely, and deep Claude Code skill integration.

### Tech stack

- **Runtime:** Bun (compile to single binary)
- **Browser engine:** Playwright (patchright fork for stealth)
- **IPC:** Unix domain socket, JSON protocol
- **Linting:** Biome
- **Testing:** Bun test runner
- **CI:** GitHub Actions (matrix: Ubuntu + macOS)
- **Release:** release-please automation

### Key architectural decisions

1. **Persistent daemon** — amortises browser startup across commands. Good decision; enables the sub-200ms warm latency that makes agent-driven QA practical.
2. **ARIA-tree refs** — agents interact via `@e1` instead of CSS selectors. Good decision; aligns with how accessibility trees expose semantics.
3. **Single binary** — eliminates Node.js dependency for end users. Good decision for distribution.
4. **Unix socket only** — limits to same-machine use. This caps the project's potential (see gaps below).
5. **Global mutable ref state** — refs are module-level singletons. Works for single-session but creates coupling that will bite as concurrency grows.

---

## Phase 2 — Gap Identification

### 2.1 Core Functionality

**What works end-to-end:** Navigate → snapshot → interact → assert → screenshot. Login flows, multi-tab, multi-session, flows, healthchecks, accessibility auditing, network interception, dialog handling, cookie/storage inspection.

**Gaps identified:**

1. ~~**No visual diff / regression detection.**~~ **Resolved.** `browse screenshot --diff baseline.png --threshold N` compares against a baseline and produces a diff image + similarity score. See `src/visual-diff.ts`.

2. ~~**No headed mode.**~~ **Resolved.** Set `BROWSE_HEADED=1` before the daemon starts to launch visible Chromium. See `src/cli.ts`, `src/daemon.ts`.

3. **No video/trace recording.** Playwright natively supports trace recording (`tracing.start()`) and video. Browse has no way to capture a session as a reviewable artifact. When an agent runs a 20-step flow and something fails at step 15, the only evidence is text output and a final screenshot.

4. **No report generation.** After a QA session, there is no way to compile findings into a shareable artifact (HTML report, PDF). The agent's output is ephemeral terminal text. The roadmap mentions this but it is unimplemented.

5. **Flows cannot branch or loop.** Flow steps execute linearly. There is no conditional logic (`if element visible, do X, else Y`), no loops (`repeat until`), no early exit. This forces complex flows to be orchestrated at the agent level rather than in config.

6. **No form-level operations.** There is no `browse form-fill @form1 --data '{"email":"...","pass":"..."}'` that fills an entire form in one command. The agent must snapshot, then fill each field individually. For a tool optimised for token efficiency, this is a missed opportunity.

7. **No file download verification.** `browse download` can trigger downloads, but there is no way to verify the downloaded file's contents, size, or type — only that a download event fired.

### 2.2 Developer Experience

8. ~~**Config file must be in cwd.**~~ **Resolved.** Config is now resolved via `--config` flag > upward directory search > `~/.browse/config.json` global fallback. See `src/config.ts`.

9. **No `browse init` scaffolding command.** New users must hand-write `browse.config.json` from scratch. There is no interactive setup, no template generation, no config validation command (beyond runtime errors).

10. **Screenshot cleanup is manual.** Screenshots accumulate in `~/.bun-browse/screenshots/` with no expiry, no rotation, no `browse screenshots clean` command. Over time this silently consumes disk.

11. **No shell completions.** 50+ commands with flags but no bash/zsh/fish completion scripts. Discoverability relies entirely on `browse help`.

### 2.3 Reliability & Resilience

12. **Single retry on daemon crash with no backoff.** `retry.ts` retries exactly once. If the browser crashes due to a resource-intensive page and the respawned daemon hits the same page, it will crash again with no circuit breaking. The CLI should implement exponential backoff (2-3 retries) and optionally skip the failing command.

13. ~~**No SIGTERM/SIGINT handler in the daemon.**~~ **Resolved.** The daemon traps SIGTERM/SIGINT for graceful shutdown — clears idle timer, closes server/browser, removes PID/socket/token files. See `src/daemon.ts`.

14. **No daemon health endpoint.** `browse ping` exists but there is no continuous health monitoring, no way for CI to poll daemon readiness, and no structured health response (uptime, memory, open sessions, browser version).

15. **RingBuffer uses O(n) shift.** `buffers.ts` calls `this.items.shift()` which is O(n) for arrays. At capacity 500 this is negligible, but the implementation is a latent issue if buffer sizes are ever increased. Should use a circular index.

### 2.4 Performance & Scalability

16. **No TCP/HTTP transport.** Unix socket limits Browse to same-machine use. For CI pipelines where the browser runs in a sidecar container, or for remote QA against a headless server, there is no network transport option. Adding an optional `--listen tcp://0.0.0.0:9222` mode would unlock remote agent → browser topologies.

17. **Flow steps execute sequentially with no parallelism.** Multi-page healthchecks visit pages one at a time. For a healthcheck across 10 pages, this is 10x slower than necessary. Independent pages could be checked in parallel across sessions.

### 2.5 Security & Compliance

18. ~~**No authentication for the daemon socket.**~~ **Resolved.** A 256-bit random token is generated at daemon startup, stored at `$XDG_STATE_HOME/browse/daemon.token` (0o600), and validated on every request. See `src/auth.ts`.

### 2.6 User Experience & Polish

19. **No `--dry-run` for flows.** Before running a 15-step flow that interacts with a production-like environment, there is no way to preview what the flow will do. A `--dry-run` flag that prints the steps without executing them would add confidence.

20. **No progress feedback for long flows.** `flow-runner.ts` executes steps silently until completion. For a 15-step flow, the agent (and user) see nothing until the entire flow finishes. Streaming step-by-step results would improve observability.

### 2.7 Ecosystem & Integration

21. **No JSON output for all commands.** The `--json` flag exists but was only recently fixed (v0.7.1), and some commands still return human-readable text even with `--json`. For CI integration and programmatic consumption, every command should have a machine-parseable output mode.

22. ~~**No JUnit/TAP test output format.**~~ **Resolved.** `--reporter junit` on `flow` and `healthcheck` commands outputs JUnit XML to stdout. See `src/reporters.ts`.

23. **No webhook/callback on completion.** When a flow or healthcheck finishes, there is no way to notify an external system (Slack, PagerDuty, CI webhook). The tool is fire-and-forget from the terminal.

### 2.8 Documentation & Discoverability

Documentation is strong — 12 pages covering commands, architecture, authentication, sessions, flows, accessibility, development, and configuration. No significant gaps. The `docs/` directory is comprehensive and well-structured.

### 2.9 Testing & Quality Assurance

24. **No visual regression test suite for Browse itself.** The tool takes screenshots of other apps but does not test its own output formatting, ref assignment stability, or snapshot rendering against golden files. Property-based testing for the ref assignment algorithm (which must be deterministic and stable across re-snapshots of the same page) would catch subtle regressions.

### 2.10 The "Extraordinary" Factor

25. **No AI-powered assertion mode.** This is the single biggest opportunity. Browse is built for AI agents, yet its assertion system is purely mechanical (`text-contains`, `element-count`, `url-contains`). An `assert ai "the login form should show a validation error for invalid email"` command that sends a screenshot to a vision model and returns pass/fail with reasoning would be transformative. No other browser automation tool does this. It would let agents verify *visual correctness* — layout, styling, truncation, overlapping elements — not just DOM state. This is the feature that would make people share the project out of genuine excitement.

---

## Phase 3 — Prioritised List

### Tier 1 — Table Stakes ✅

All Tier 1 items have been implemented.

| # | Feature | Category | Impact | Effort | Status |
|---|---|---|---|---|---|
| 1 | **Visual diff screenshots** — `browse screenshot --diff baseline.png` that compares against a baseline and returns a diff image + similarity score | Core (2.1) | Enables regression detection, the primary QA use case, without relying on multimodal vision | M | ✅ Done |
| 2 | **Headed mode** — `BROWSE_HEADED=1` to launch visible Chromium | Core (2.1) | Unblocks human debugging when agent reports failures; bridges the agent→human handoff gap | S | ✅ Done |
| 3 | **Graceful signal handling** — trap SIGTERM/SIGINT in daemon, clean up PID/socket/token, close browser | Reliability (2.3) | Prevents orphaned files and zombie browser processes in CI and interactive use | S | ✅ Done |
| 4 | **Config file resolution** — `--config` flag + upward directory search + `~/.browse/config.json` global fallback | DX (2.2) | Lets users run `browse` from any subdirectory without losing config; standard CLI convention | S | ✅ Done |
| 5 | **Socket authentication token** — shared secret generated on daemon start, saved to token file, validated on every request | Security (2.5) | Prevents unauthorised processes without token-file access from executing arbitrary JS via `browse eval` through the socket | S | ✅ Done |
| 6 | **JUnit reporter for flows and healthchecks** — `--reporter junit` writes XML to stdout | Ecosystem (2.7) | Makes Browse usable in CI pipelines that gate on test results (GitHub Actions, Jenkins, GitLab) | S | ✅ Done |

### Tier 2 — Competitive Edge ✅

All Tier 2 items have been implemented.

| # | Feature | Category | Impact | Effort | Status |
|---|---|---|---|---|---|
| 7 | **Trace recording** — `browse trace start` / `browse trace stop --out trace.zip` wrapping Playwright's tracing API | Core (2.1) | Captures full session replay (DOM snapshots, network, screenshots) for post-mortem debugging of failed QA runs | M | ✅ Done |
| 8 | **HTML report generation** — `browse report --out qa-report.html` that compiles session screenshots into a single shareable HTML document | Core (2.1) | Gives stakeholders a reviewable artifact instead of ephemeral terminal output | M | ✅ Done |
| 9 | **Retry with exponential backoff** — 3 retries with 1s/2s/4s delays on daemon crash, plus circuit breaker that skips after 3 consecutive failures | Reliability (2.3) | Prevents silent single-retry failures in CI; makes long healthcheck runs resilient to transient browser crashes | S | ✅ Done |
| 10 | **TCP transport mode** — `browse daemon --listen tcp://0.0.0.0:9222` for remote access with token auth | Performance (2.4) | Unlocks sidecar-container, remote-server, and multi-machine topologies for CI and cloud-hosted agents | M | ✅ Done |
| 11 | **`browse init`** — scaffolding that generates `browse.config.json` with environments, sample flows, and healthcheck | DX (2.2) | Eliminates the cold-start friction of hand-writing config; guides users through setup in 60 seconds | S | ✅ Done |
| 12 | **Conditional flow steps** — `if` / `else` / `while` constructs in flow definitions with condition expressions | Core (2.1) | Enables self-contained complex flows (retry login, handle optional modals) without agent orchestration | M | ✅ Done |
| 13 | **Parallel healthcheck pages** — `--parallel` flag runs independent page checks concurrently with configurable `--concurrency` | Performance (2.4) | Reduces 10-page healthcheck from ~30s to ~5s by leveraging the existing session/pool infrastructure | M | ✅ Done |
| 14 | **Streaming flow output** — `--stream` flag emits step results as NDJSON as they complete | UX (2.6) | Gives agents and humans real-time visibility into flow progress instead of waiting for full completion | S | ✅ Done |
| 15 | **`--dry-run` for flows** — print step plan without executing | UX (2.6) | Lets users preview destructive or long flows before committing; adds confidence for production-adjacent environments | S | ✅ Done |
| 16 | **Structured daemon health endpoint** — `browse status --json` returning JSON with uptime, memory, sessions, tabs, browser version, daemon PID | Reliability (2.3) | Enables CI readiness checks and operational monitoring of long-running daemon instances | S | ✅ Done |
| 17 | **Shell completions** — `browse completions bash/zsh/fish` generates completion scripts for all 50+ commands and their flags | DX (2.2) | Standard CLI polish; improves discoverability for human users alongside agents | S | ✅ Done |
| 18 | **Screenshot management** — `browse screenshots list/clean/count` with `--older-than` duration filtering | DX (2.2) | Prevents silent disk consumption from accumulated screenshots in long-running environments | S | ✅ Done |

### Tier 3 — Extraordinary

| # | Feature | Category | Impact | Effort |
|---|---|---|---|---|
| 19 | **AI-powered visual assertions** — `browse assert ai "the page should show a dashboard with 3 charts and no error banners"` sends a screenshot to a vision model and returns structured pass/fail with reasoning | Extraordinary (2.10) | No other browser automation tool does this. Enables agents to verify *visual correctness* — layout, styling, truncation, visual regressions — not just DOM state. This is the feature that would make the project remarkable. | L |
| 20 | **Session replay viewer** — `browse replay --session mytest` opens a local web UI that plays back the session as an interactive timeline of snapshots, screenshots, commands, and results | Extraordinary (2.10) | Transforms Browse from a CLI tool into a full QA investigation platform. Makes it trivially easy to review what an agent did and why it passed/failed. | XL |
| 21 | **Multi-role parallel testing** — `browse test-matrix --roles admin,viewer,guest --flow checkout` runs the same flow simultaneously across sessions with different auth, and diffs the results | Extraordinary (2.10) | Permission testing is Browse's sweet spot (per the roadmap). Automating the matrix of "same flow, different roles, diff the outcomes" is a killer feature for RBAC-heavy apps. | L |
| 22 | **Smart wait with auto-snapshot** — after every navigation-triggering command (goto, click that navigates, form submit), automatically re-snapshot and attach refs to the response | Extraordinary (2.10) | Eliminates the most common two-command pattern (`click` then `snapshot`) saving ~40% of agent commands in typical QA sessions. Massive token efficiency gain. | M |
| 23 | **Diff screenshots across branches** — `browse diff --baseline main --current feature-branch --flow healthcheck` runs the same flow on two deployments and produces a visual diff report | Extraordinary (2.10) | Purpose-built for the PR review workflow: "show me what changed visually." Integrates directly into the agent's code review loop. | L |
| 24 | **Bulk form fill** — `browse form @form1 --data '{"email":"test@example.com","password":"secret"}'` fills all fields in a form by matching field names/labels to data keys | Core (2.1) | Reduces N fill commands to 1. Directly aligned with Browse's token-efficiency goal. The ref system already identifies form fields; this composes them. | M |
| 25 | **Flow sharing marketplace** — `browse flow install company/checkout-flow` that fetches community-contributed flow definitions from a registry | Extraordinary (2.10) | Creates network effects. Common flows (Stripe checkout, OAuth login, cookie consent) become reusable across projects. Transforms Browse from a tool into a platform. | XL |

---

## Summary

Browse is a well-architected, well-documented tool that has executed its original six-phase roadmap cleanly. The foundation is solid. The gaps fall into three buckets:

1. **Table stakes (items 1–6):** ✅ **All complete.** Visual diffing, headed mode, signal handling, config resolution, socket auth, and JUnit reporter. These are expected by any serious QA tool user and were blocking adoption in team/CI contexts.

2. **Competitive edge (items 7–18):** ✅ **All complete.** Trace recording, HTML reports, retry with exponential backoff + circuit breaker, TCP transport, `browse init`, conditional flow steps (if/else/while), parallel healthchecks, streaming flow output, dry-run, structured health endpoint, shell completions, and screenshot management. These differentiate Browse from "just use Playwright directly" and make the daemon architecture pay dividends.

3. **Extraordinary (items 19–25):** AI-powered visual assertions, session replay, multi-role matrix testing, auto-snapshot, branch diffing, bulk form fill, and flow sharing. These leverage Browse's unique position as an AI-agent-native browser tool to do things no existing tool does. Item 19 (AI visual assertions) is the single highest-impact feature — it turns Browse from "Playwright with a CLI" into "the first browser automation tool that can actually see."

The project's biggest strategic risk is being perceived as "a nice Playwright wrapper" rather than a category-defining tool. The Tier 3 features — especially AI assertions and multi-role matrix testing — are what move it from useful to remarkable.
