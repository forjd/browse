# Implementation Plans — Feature Gap Closure

**Date:** 2026-03-22
**Based on:** [20-Persona Gap Analysis](../research/feature-gap-analysis-20-personas.md)

This directory contains implementation plans for closing all 20 feature gaps identified
in the persona-based gap analysis. Plans are organized by priority tier.

---

## Tier 1 — High Impact (implement first)

| # | Plan | Command(s) | Personas |
|---|------|-----------|----------|
| 1 | [Test Recorder](./01-record.md) | `record` | QA, PM, Freelancer, Tech Writer |
| 2 | [Crawl Pipeline](./02-crawl.md) | `crawl` | Data Scientist, SEO, Freelancer |
| 3 | [Network Simulation](./03-network-simulation.md) | `throttle`, `offline` | Chaos Eng, Perf Eng, Frontend Dev |
| 4 | [Natural Language](./04-natural-language.md) | `do` | PM, Tech Writer, Freelancer |
| 5 | [Visual Regression Testing](./05-vrt.md) | `vrt` | OSS Maintainer, Designer, QA |

## Tier 2 — Medium Impact

| # | Plan | Command(s) | Personas |
|---|------|-----------|----------|
| 6 | [CI/CD & Docker](./06-cicd-docker.md) | `ci-init`, Dockerfile, GH Action | DevOps, QA, OSS Maintainer |
| 7 | [Watch & REPL](./07-watch-repl.md) | `watch`, `repl` | Test Author, Frontend Dev, QA |
| 8 | [SEO Audit](./08-seo.md) | `seo` | SEO Specialist, Freelancer |
| 9 | [Performance Regression](./09-perf-regression.md) | `perf baseline`, `perf compare` | Perf Eng, DevOps, Frontend Dev |
| 10 | [Event Streaming](./10-event-streaming.md) | `subscribe` | AI/LLM Dev, DevOps |
| 11 | [Dev Server Lifecycle](./11-dev-server.md) | `devServer` config key | Frontend Dev, QA |
| 12 | [Compliance Audit](./12-compliance.md) | `compliance` | Compliance Officer, Freelancer |

## Tier 3 — Lower Impact / Niche

| # | Plan | Command(s) | Personas |
|---|------|-----------|----------|
| 13 | [Active Security Scanning](./13-active-security.md) | `security scan` | Security Researcher |
| 14 | [Multi-Locale Testing](./14-i18n.md) | `i18n` | i18n Engineer |
| 15 | [API Contract Testing](./15-api-contract.md) | `api-assert` | API Dev, QA |
| 16 | [Design Token Audit](./16-design-audit.md) | `design-audit` | Designer |
| 17 | [Doc Screenshots](./17-doc-screenshots.md) | `doc-capture` | Tech Writer |
| 18 | [Touch & Device Emulation](./18-touch-devices.md) | `gesture`, device profiles | Mobile Dev |
| 19 | [Scheduled Monitoring](./19-monitoring.md) | `monitor` | Freelancer, DevOps |
| 20 | [A11y Enhancements](./20-a11y-enhancements.md) | `a11y --remediate`, `a11y coverage` | A11y Specialist |

---

## Cross-Cutting Concerns

All new commands must follow the existing pattern:

1. **Handler** in `src/commands/<name>.ts` — accepts `(page, args, options?) → Response`
2. **Protocol** — add to `VALID_COMMANDS` in `src/protocol.ts`
3. **Dispatch** — add case + imports in `src/daemon.ts`, flags in `KNOWN_FLAGS`
4. **Help** — add entry in `src/help.ts`
5. **Tests** — add `test/<name>.test.ts`
6. **Docs** — update `docs/commands.md` and `SKILL.md`

### Shared Infrastructure Needed

Several plans depend on common infrastructure:

- **LLM integration layer** (plans 4, 20) — reuse `assert-ai` provider abstraction
- **Reporter extensions** (plans 5, 8, 9, 12, 14, 16) — extend existing reporter system
- **CDP access patterns** (plans 3, 9, 18) — reuse existing CDP console/accessibility patterns
- **Flow runner extensions** (plans 1, 7, 14) — extend `flow-runner.ts`

### Implementation Order Recommendation

```
Phase A (Tier 1):  record → crawl → throttle → vrt → do
Phase B (Tier 2):  ci-init → watch/repl → seo → perf-regression → subscribe → dev-server → compliance
Phase C (Tier 3):  security-scan → i18n → api-assert → design-audit → doc-capture → gesture → monitor → a11y
```

Within each phase, features are independent and can be built in parallel.
