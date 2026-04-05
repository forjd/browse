# Browse CLI — New Roadmap (2026)

**Current Version:** 0.12.x  
**Status:** Feature-complete for core use cases. All 20 Phase 7 features implemented.  
**Focus:** Stability, performance, ecosystem, and enterprise readiness.

---

## Executive Summary

Browse has evolved from a simple daemon-based Playwright wrapper into a comprehensive browser automation platform with 80+ commands covering navigation, testing, auditing, data extraction, AI integration, CI/CD, and more. 

The original 6-phase roadmap (Foundation → Snapshot → Screenshot → Auth → Domain Commands → Hardening) is complete. The subsequent 20-feature Phase 7 gap analysis (record, crawl, NL commands, VRT, SEO, etc.) is also complete.

**This roadmap focuses on:**
1. **Reliability** — Hardening, edge cases, production stability
2. **Performance** — Speed, memory, resource efficiency
3. **Ecosystem** — Plugins, integrations, extensibility
4. **Enterprise** — Teams, collaboration, governance
5. **Platform** — Windows support, cloud execution

---

## Phase 8 — Production Hardening

**Goal:** Bulletproof reliability for CI/CD and production workloads.

### Error Recovery & Resilience

- [ ] **Browser crash auto-recovery** — Detect Chromium crashes, restart with session restoration
- [ ] **Network failure resilience** — Retry with exponential backoff on transient failures
- [ ] **Memory pressure handling** — Graceful degradation when approaching memory limits
- [ ] **Corrupted state detection** — Validate and repair corrupted session data

### Testing & Quality

- [ ] **Expand integration test coverage** — Target 90%+ coverage for all commands
- [ ] **Stress testing** — Long-running daemon tests (24h+), memory leak detection
- [ ] **Fuzz testing** — Randomized input testing for command parsers
- [ ] **Cross-platform CI** — macOS (Intel + ARM), Linux (x64 + ARM64)

### Observability

- [ ] **Structured logging** — JSON logs with configurable levels and outputs
- [ ] **Metrics export** — Prometheus/OpenTelemetry metrics for daemon health
- [ ] **Distributed tracing** — Trace command execution across sessions
- [ ] **Performance profiling** — Built-in CPU/memory profiling for slow commands

---

## Phase 9 — Performance & Efficiency

**Goal:** Sub-100ms warm commands, lower resource usage.

### Speed Optimisations

- [ ] **Connection pooling** — Reuse Playwright connections across commands
- [ ] **Lazy context creation** — Defer browser context creation until needed
- [ ] **Snapshot caching** — Cache accessibility trees for unchanged pages
- [ ] **Command batching** — Execute multiple commands in a single daemon round-trip

### Resource Efficiency

- [ ] **Memory optimisation** — Reduce per-page memory footprint
- [ ] **Disk usage management** — Auto-cleanup of screenshots, traces, videos by retention policy
- [ ] **Browser tab recycling** — Reuse tabs instead of creating new ones
- [ ] **Lazy screenshot encoding** — Encode only when needed

### Benchmarking

- [ ] **Performance regression suite** — Automated benchmarks on every commit
- [ ] **Competitive benchmarking** — Compare against Playwright, Selenium, Cypress
- [ ] **Real-world workload testing** — Typical QA workflows as benchmarks

---

## Phase 10 — Ecosystem & Extensibility

**Goal:** Enable community plugins and integrations.

### Plugin System

- [ ] **Plugin architecture** — Load external plugins from `~/.browse/plugins/`
- [ ] **Plugin API** — Stable API for adding custom commands and reporters
- [ ] **Plugin marketplace** — Registry/discovery for community plugins
- [ ] **Official plugins** — First-party plugins for popular tools (Slack, Discord, JIRA)

### Framework Integrations

- [ ] **Jest/Vitest runner** — Native test runner integration
- [ ] **Cucumber/Gherkin** — BDD-style test definitions
- [ ] **GitHub Actions** — Official action with built-in caching
- [ ] **Docker optimisation** — Slimmer container images, multi-stage builds

### Output Formats

- [ ] **Additional reporters** — TAP, Allure, HTML with filtering/search
- [ ] **JUnit enhancements** — Test suite metadata, flaky test detection
- [ ] **Custom reporter API** — JavaScript/TypeScript reporter plugins

---

## Phase 11 — Enterprise Features

**Goal:** Team collaboration, governance, and compliance.

### Collaboration

- [ ] **Shared configuration** — Team-wide config with user-specific overrides
- [ ] **Flow versioning** — Version control integration for flow definitions
- [ ] **Flow templates** — Pre-built templates for common patterns
- [ ] **Shared screenshot storage** — S3/GCS/Azure integration for team access

### Governance

- [ ] **Audit logging** — Log all commands for compliance (who, what, when)
- [ ] **Approval workflows** — Require approval for sensitive flows (production)
- [ ] **Role-based access** — Read-only, operator, admin roles for shared instances
- [ ] **Secrets management** — Integration with 1Password, HashiCorp Vault, AWS Secrets Manager

### Reporting & Analytics

- [ ] **Historical trends** — Track test performance over time
- [ ] **Flaky test detection** — Identify unreliable tests automatically
- [ ] **Coverage reporting** — Page/flow coverage analysis
- [ ] **Executive dashboards** — High-level health metrics for stakeholders

---

## Phase 12 — Platform Expansion

**Goal:** Windows support and cloud execution.

### Windows Support

- [ ] **Windows daemon** — Named pipes instead of Unix sockets
- [ ] **Windows installer** — MSI/EXE installer, registry integration
- [ ] **Windows CI** — GitHub Actions Windows runners
- [ ] **Path handling** — Cross-platform path normalization

### Cloud Execution

- [ ] **Browserless integration** — Connect to remote Chrome instances
- [ ] **Lambda/Cloud Functions** — Serverless browser automation
- [ ] **Grid support** — Selenium Grid-compatible protocol
- [ ] **Managed cloud** — Hosted browse-as-a-service option

### Container Orchestration

- [ ] **Kubernetes operator** — Native K8s integration with CRDs
- [ ] **Helm charts** — Production-ready deployment templates
- [ ] **Auto-scaling** — Scale daemon pool based on queue depth
- [ ] **Health probes** — Liveness/readiness endpoints for K8s

---

## Phase 13 — Advanced AI Integration

**Goal:** Deeper AI/ML integration beyond current `assert-ai` and `do` commands.

### Intelligent Automation

- [ ] **Self-healing selectors** — AI-powered selector recovery when elements change
- [ ] **Visual element detection** — Find elements by description ("the blue submit button")
- [ ] **Smart waiting** — ML-based wait conditions instead of fixed timeouts
- [ ] **Anomaly detection** — Flag unusual page changes automatically

### Test Generation

- [ ] **Auto-test generation** — Generate test flows from user sessions
- [ ] **Test case expansion** — Expand manual tests with AI-generated edge cases
- [ ] **Data generation** — Generate realistic test data for forms
- [ ] **Visual regression AI** — AI-powered visual diff (ignore dynamic content)

### Documentation

- [ ] **Auto-documentation** — Generate docs from flow definitions
- [ ] **Video narration** — AI-generated narration for recorded videos
- [ ] **Bug report generation** — Auto-create detailed bug reports from failures

---

## Phase 14 — Developer Experience

**Goal:** Best-in-class DX for automation engineers.

### Tooling

- [ ] **VS Code extension** — IntelliSense, debugging, test explorer
- [ ] **Language server** — Autocomplete for flows and config
- [ ] **Interactive debugger** — Step-through debugging for flows
- [ ] **Hot reload** — Auto-restart on config/flow changes

### Debugging

- [ ] **Network inspector** — HAR export, request/response inspection
- [ ] **Timeline view** — Visual timeline of command execution
- [ ] **State snapshots** — Full page state capture on failure
- [ ] **Replay debugging** — Replay failed runs with full observability

### Onboarding

- [ ] **Interactive tutorial** — Built-in guided tour for new users
- [ ] **Example library** — Curated examples for common use cases
- [ ] **Best practices guide** — Patterns for maintainable automation
- [ ] **Migration guides** — From Selenium, Cypress, Playwright

---

## Phase 15 — Research & Future

**Goal:** Explore emerging technologies and long-term bets.

### Emerging Tech

- [ ] **WebDriver BiDi** — Native BiDi protocol support (when stable)
- [ ] **WebGPU testing** — GPU-accelerated page testing
- [ ] **PWA testing** — Service worker, offline, install prompt testing
- [ ] **WebAssembly inspection** — WASM debugging and testing

### Experimental

- [ ] **Headless vs headed parity** — Ensure identical behaviour in both modes
- [ ] **Parallel page execution** — True parallelism within a session
- [ ] **Mobile device farm** — Integration with real device clouds
- [ ] **AR/VR testing** — WebXR testing capabilities

---

## Milestones

| Phase | Target | Key Deliverables |
|-------|--------|------------------|
| Phase 8 | Q2 2026 | Crash recovery, 90% test coverage, structured logging |
| Phase 9 | Q3 2026 | Sub-100ms commands, 50% memory reduction, benchmarks |
| Phase 10 | Q4 2026 | Plugin API, Jest runner, GitHub Action |
| Phase 11 | Q1 2027 | Team config, audit logging, S3 integration |
| Phase 12 | Q2 2027 | Windows support, K8s operator, cloud execution |
| Phase 13 | Q3 2027 | Self-healing selectors, auto-test generation |
| Phase 14 | Q4 2027 | VS Code extension, interactive debugger |
| Phase 15 | 2028+ | BiDi protocol, WebGPU, PWA testing |

---

## Success Metrics

| Metric | Current | Target (2027) |
|--------|---------|---------------|
| Commands | 80+ | 100+ (via plugins) |
| Warm command latency | ~30ms | <100ms (p95) |
| Test coverage | ~70% | 95%+ |
| GitHub stars | TBD | 5,000+ |
| Active contributors | TBD | 50+ |
| Windows users | 0% | 30% |
| Enterprise customers | TBD | 100+ |

---

## Maintenance Mode

Existing features in maintenance mode (bug fixes only, no new development):

- **Core commands** — Navigation, interaction, observation (stable)
- **Flow system** — Mature, feature-complete
- **Basic reporting** — JUnit, JSON output
- **Authentication** — Login, auth-state (stable)

---

## How to Contribute

1. **Pick a phase** — Start with Phase 8 if you want stability work, Phase 10 for features
2. **Check issues** — Look for `good-first-issue` and `help-wanted` labels
3. **Propose changes** — Open an RFC issue for significant additions
4. **Follow conventions** — See [Development Guide](../development.md)

---

## See Also

- [Original Roadmap (Archived)](./archive/ROADMAP.md) — Phases 0-6
- [Phase 7 Plans (Archived)](./archive/plans/) — 20 feature gap plans
- [Development Guide](../development.md) — Contributing guidelines
- [Architecture](../architecture.md) — Technical design
