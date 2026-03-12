# Phase 4 — Domain-Specific Commands

**Goal:** Bake in application-specific awareness so the agent can do higher-level QA with fewer tool calls. Configurable flows, general-purpose assertions, and a healthcheck command.

**Prerequisite:** Phase 3 (auth and multi-tab) — see `phase-3-auth-and-multi-tab.md`.

---

## File Structure (additions to Phase 3)

```
src/
  commands/
    flow.ts         # Execute named multi-step flows from config
    assert.ts       # General-purpose assertions (visible, text, URL, permission)
    healthcheck.ts  # Hit key pages, screenshot, check console, report
  flow-runner.ts    # Step execution engine, variable interpolation, reporting
```

---

## Protocol Changes

### Request

Extend the command union from Phase 3:

```ts
type Request = {
  cmd: "goto" | "text" | "quit" | "snapshot" | "click" | "fill" | "select"
     | "screenshot" | "console" | "network"
     | "auth-state" | "login" | "tab"
     | "flow" | "assert" | "healthcheck";
  args: string[];
};
```

---

## Config Extensions (`browse.config.json`)

Phase 3 introduced `browse.config.json` with `environments`. Phase 4 extends the same file with `flows`, `permissions`, and `healthcheck`. No breaking changes — existing Phase 3 configs remain valid.

### Extended schema

```ts
type BrowseConfig = {
  environments: Record<string, EnvironmentConfig>;  // Phase 3
  flows?: Record<string, FlowConfig>;               // Phase 4
  permissions?: Record<string, PermissionConfig>;    // Phase 4
  healthcheck?: HealthcheckConfig;                   // Phase 4
};
```

### Flow config

```ts
type FlowConfig = {
  description?: string;           // Human-readable summary shown in flow list
  variables?: string[];           // Required variable names (validated before execution)
  steps: FlowStep[];
};

type FlowStep =
  | { goto: string }                                          // Navigate to URL (supports {{vars}})
  | { click: string }                                         // Click by accessible name or ref
  | { fill: Record<string, string> }                          // Fill fields by accessible name → value
  | { select: Record<string, string> }                        // Select options by accessible name → value
  | { screenshot: true }                                      // Screenshot current page
  | { screenshot: string }                                    // Screenshot to specific path
  | { console: "error" | "warning" | "all" }                  // Check console at specified level
  | { network: true }                                         // Check for failed requests
  | { wait: WaitCondition }                                   // Wait for a condition
  | { assert: AssertCondition }                               // Assert a condition
  | { login: string }                                         // Run login for named environment
  | { snapshot: true }                                        // Take accessibility snapshot (implicit before fill/click/select)
  ;
```

Wait conditions:

```ts
type WaitCondition =
  | { urlContains: string }
  | { urlPattern: string }
  | { elementVisible: string }        // CSS selector
  | { textVisible: string }           // Text content on page
  | { timeout: number }               // Milliseconds (explicit pause, use sparingly)
  ;
```

Assert conditions (shared with the `assert` command):

```ts
type AssertCondition =
  | { visible: string }               // CSS selector is visible
  | { notVisible: string }            // CSS selector is not visible
  | { textContains: string }          // Page body contains text
  | { textNotContains: string }       // Page body does not contain text
  | { urlContains: string }           // Current URL contains string
  | { urlPattern: string }            // Current URL matches regex
  | { elementText: { selector: string; contains: string } }  // Specific element contains text
  | { elementCount: { selector: string; count: number } }    // Element count matches
  ;
```

### Permission config

Named permission mappings build on flows and assertions. Each permission defines the page to navigate to and what to check:

```ts
type PermissionConfig = {
  page: string;                       // URL to navigate to (supports {{vars}})
  granted: AssertCondition;           // Condition that proves access is granted
  denied: AssertCondition;            // Condition that proves access is denied
};
```

### Healthcheck config

```ts
type HealthcheckConfig = {
  pages: HealthcheckPage[];
};

type HealthcheckPage = {
  url: string;                        // Supports {{base_url}} variable
  name?: string;                      // Human-readable name for reporting
  screenshot?: boolean;               // Default: true
  console?: "error" | "warning";      // Default: "error"
  assertions?: AssertCondition[];     // Optional assertions per page
};
```

### Example config (Phase 4 additions)

```json
{
  "environments": {
    "staging": { "..." : "..." }
  },
  "flows": {
    "signup": {
      "description": "Register a new user account",
      "variables": ["base_url", "test_email", "test_pass"],
      "steps": [
        { "goto": "{{base_url}}/register" },
        { "fill": { "Email": "{{test_email}}", "Password": "{{test_pass}}" } },
        { "click": "Submit" },
        { "wait": { "urlContains": "/welcome" } },
        { "screenshot": true },
        { "assert": { "textContains": "Welcome" } }
      ]
    },
    "create-user": {
      "description": "Create a user via the admin panel",
      "variables": ["base_url", "user_email", "user_role"],
      "steps": [
        { "login": "staging" },
        { "goto": "{{base_url}}/admin/users/new" },
        { "fill": { "Email": "{{user_email}}" } },
        { "select": { "Role": "{{user_role}}" } },
        { "click": "Create User" },
        { "wait": { "textVisible": "User created" } },
        { "screenshot": true }
      ]
    }
  },
  "permissions": {
    "Create User": {
      "page": "{{base_url}}/admin/users/new",
      "granted": { "visible": "form.create-user" },
      "denied": { "textContains": "Access denied" }
    },
    "Delete User": {
      "page": "{{base_url}}/admin/users",
      "granted": { "visible": "button.delete-user" },
      "denied": { "notVisible": "button.delete-user" }
    }
  },
  "healthcheck": {
    "pages": [
      { "url": "{{base_url}}/api/health", "name": "API Health", "screenshot": false,
        "assertions": [{ "textContains": "ok" }] },
      { "url": "{{base_url}}/dashboard", "name": "Dashboard" },
      { "url": "{{base_url}}/settings", "name": "Settings" }
    ]
  }
}
```

---

## Flow Command (`flow.ts` + `flow-runner.ts`)

Executes a named multi-step flow defined in config. Each flow replaces 3–8 individual browse commands, reducing token cost and the chance of the agent getting lost mid-sequence.

### Usage

```
browse flow <name> --var key=value [--var key=value ...] [--continue-on-error]
browse flow list
```

### Argument parsing

```
browse flow signup --var base_url=https://staging.example.com --var test_email=a@b.com --var test_pass=secret
  → cmd: "flow", args: ["signup", "--var", "base_url=https://staging.example.com", "--var", "test_email=a@b.com", "--var", "test_pass=secret"]

browse flow list
  → cmd: "flow", args: ["list"]
```

### `flow list`

Returns all configured flows with their descriptions and required variables:

```
signup — Register a new user account
  Variables: base_url, test_email, test_pass

create-user — Create a user via the admin panel
  Variables: base_url, user_email, user_role
```

If no flows are configured: `"No flows defined in browse.config.json."`.

### Variable interpolation

Variables are passed as `--var key=value` flags. The flow runner replaces `{{key}}` in all string values within flow steps before execution.

**Validation:** Before running any steps, check that all variables declared in the flow's `variables` array have been provided. Missing variables produce a clear error:

```
Missing variables for flow 'signup': test_email, test_pass
Usage: browse flow signup --var base_url=<value> --var test_email=<value> --var test_pass=<value>
```

Undeclared variables (present in step templates but not in the `variables` array) produce a warning but do not block execution — they remain as literal `{{key}}` text, which will likely cause a downstream error that's easy to diagnose.

### Flow runner (`flow-runner.ts`)

The flow runner executes steps sequentially, mapping each step type to an existing daemon command:

| Step type | Maps to |
|-----------|---------|
| `goto` | `goto` command |
| `click` | `snapshot` (if no current refs) → find element by accessible name → `click` |
| `fill` | `snapshot` (if no current refs) → find elements by accessible name → `fill` each |
| `select` | `snapshot` (if no current refs) → find elements by accessible name → `select` each |
| `screenshot` | `screenshot` command |
| `console` | `console --level <level>` command |
| `network` | `network` command |
| `wait` | Wait for condition (see below) |
| `assert` | Assert condition (see below) |
| `login` | `login --env <name>` command |
| `snapshot` | `snapshot` command |

**Implicit snapshots:** The `click`, `fill`, and `select` step types use accessible names (not refs) because refs aren't meaningful in a config file. The flow runner takes a snapshot before the first interaction step and after any navigation, then resolves the accessible name to the current ref. If no matching element is found, the step fails with: `"Element not found: 'Submit' (looked for button, link, textbox with this name)"`.

**Wait conditions:** The runner polls for the condition with a 100ms interval and a 30-second timeout (configurable per step via an optional `timeout` field). On timeout: `"Wait timed out after 30s: expected URL to contain '/welcome'"`.

### Failure modes

**Fail-fast (default):** When a step fails, the flow aborts immediately. A summary of completed steps and the failure is returned.

**Continue on error (`--continue-on-error`):** When a step fails, the runner records the failure and moves to the next step. All failures are reported at the end.

### Output format

The flow returns a step-by-step report:

```
Flow: signup (3/6 steps completed)

  ✓ Step 1: goto https://staging.example.com/register
  ✓ Step 2: fill Email, Password
  ✓ Step 3: click Submit
  ✗ Step 4: wait urlContains "/welcome"
    → Timed out after 30s. Current URL: https://staging.example.com/register?error=email_taken

Screenshots:
  (none taken before failure)
```

On success:

```
Flow: signup (6/6 steps completed)

  ✓ Step 1: goto https://staging.example.com/register
  ✓ Step 2: fill Email, Password
  ✓ Step 3: click Submit
  ✓ Step 4: wait urlContains "/welcome"
  ✓ Step 5: screenshot → /Users/dan/.bun-browse/screenshots/flow-signup-step5-20260312-143022-417.png
  ✓ Step 6: assert textContains "Welcome"

Screenshots:
  Step 5: /Users/dan/.bun-browse/screenshots/flow-signup-step5-20260312-143022-417.png
```

Screenshot paths in flows follow the pattern: `~/.bun-browse/screenshots/flow-{name}-step{n}-{timestamp}.png`.

### Error handling

- **Missing config file:** `"No browse.config.json found. Create one with flow definitions."`.
- **Unknown flow name:** `"Unknown flow: 'signup'. Available: create-user, healthcheck."`.
- **Missing variables:** List missing variables with usage hint (see above).
- **Step execution failure:** Include the step number, type, and the underlying error from the command handler.

---

## Assert Command (`assert.ts`)

A general-purpose assertion command. Checks a condition against the current page state and returns pass/fail. Useful standalone and as the building block for flow assertions and permission checks.

### Usage

```
browse assert visible <selector>
browse assert not-visible <selector>
browse assert text-contains <text>
browse assert text-not-contains <text>
browse assert url-contains <substring>
browse assert url-pattern <regex>
browse assert element-text <selector> <text>
browse assert element-count <selector> <count>
browse assert permission <name> granted|denied [--var key=value ...]
```

### Argument parsing

```
browse assert visible ".create-user-btn"
  → cmd: "assert", args: ["visible", ".create-user-btn"]

browse assert text-contains "Access denied"
  → cmd: "assert", args: ["text-contains", "Access denied"]

browse assert permission "Create User" granted --var base_url=https://staging.example.com
  → cmd: "assert", args: ["permission", "Create User", "granted", "--var", "base_url=https://staging.example.com"]
```

### General assertions

Each assertion type maps to a Playwright check:

| Subcommand | Implementation |
|-----------|---------------|
| `visible <sel>` | `page.locator(sel).first().isVisible()` — pass if true |
| `not-visible <sel>` | `page.locator(sel).first().isVisible()` — pass if false, or element doesn't exist |
| `text-contains <text>` | `page.innerText("body")` includes text (case-insensitive) |
| `text-not-contains <text>` | `page.innerText("body")` does not include text (case-insensitive) |
| `url-contains <sub>` | `page.url()` includes substring |
| `url-pattern <regex>` | `page.url()` matches regex |
| `element-text <sel> <text>` | `page.locator(sel).first().innerText()` includes text |
| `element-count <sel> <n>` | `page.locator(sel).count()` equals n |

### Output format

Pass:

```
PASS: visible ".create-user-btn"
```

Fail:

```
FAIL: visible ".create-user-btn"
  → Element not found or not visible.
```

```
FAIL: text-contains "Welcome back"
  → Page text does not contain "Welcome back".
```

Exit code: the daemon response uses `ok: true` for pass, `ok: false` for fail. The CLI prints the result and exits 0 on pass, 1 on fail. This lets the agent branch on the result programmatically.

### Permission assertions

The `assert permission` subcommand combines navigation and assertion using the `permissions` config:

```
browse assert permission "Create User" granted --var base_url=https://staging.example.com
```

**Flow:**

1. Look up `"Create User"` in `config.permissions`.
2. Interpolate variables into the `page` URL.
3. Navigate to the page (`goto`).
4. Wait for `domcontentloaded`.
5. Check the `granted` or `denied` condition (depending on the second argument).
6. Return pass/fail.

**Output:**

```
PASS: permission "Create User" granted
  → Navigated to https://staging.example.com/admin/users/new
  → Assertion: visible "form.create-user" — passed
```

```
FAIL: permission "Create User" granted
  → Navigated to https://staging.example.com/admin/users/new
  → Assertion: visible "form.create-user" — element not found or not visible
```

**Error handling:**

- **Missing config:** `"No permissions defined in browse.config.json."`.
- **Unknown permission name:** `"Unknown permission: 'Create User'. Available: Delete User, View Reports."`.
- **Invalid direction:** `"Expected 'granted' or 'denied', got 'allow'. Usage: browse assert permission <name> granted|denied"`.

---

## Healthcheck Command (`healthcheck.ts`)

Navigates to a list of key pages, screenshots each, checks console for errors, runs optional assertions, and returns a pass/fail summary. Designed to run after every deployment to staging.

### Usage

```
browse healthcheck --var base_url=https://staging.example.com [--no-screenshots]
```

### Behaviour

The healthcheck command always runs in continue-on-error mode — it visits every configured page regardless of individual failures, then reports all results.

**For each page in `config.healthcheck.pages`:**

1. Navigate to the URL (with variable interpolation).
2. Wait for `domcontentloaded`.
3. If `screenshot` is not `false`, take a screenshot.
4. If `console` is set, drain the console buffer at that level and record any entries.
5. If `assertions` are defined, run each assertion and record pass/fail.
6. Record the page result: pass (no console errors, all assertions passed) or fail.

### Output format

```
Healthcheck: 2/3 pages passed

  ✓ API Health (https://staging.example.com/api/health)
    Assertions: 1/1 passed

  ✓ Dashboard (https://staging.example.com/dashboard)
    Screenshot: /Users/dan/.bun-browse/screenshots/healthcheck-dashboard-20260312-143022-417.png
    Console: clean

  ✗ Settings (https://staging.example.com/settings)
    Screenshot: /Users/dan/.bun-browse/screenshots/healthcheck-settings-20260312-143024-891.png
    Console errors:
      [ERROR] Uncaught TypeError: Cannot read properties of undefined (reading 'theme')
              at https://staging.example.com/static/js/settings.js:142:8

Screenshots:
  Dashboard: /Users/dan/.bun-browse/screenshots/healthcheck-dashboard-20260312-143022-417.png
  Settings: /Users/dan/.bun-browse/screenshots/healthcheck-settings-20260312-143024-891.png
```

Screenshot paths follow the pattern: `~/.bun-browse/screenshots/healthcheck-{name}-{timestamp}.png`. The `name` is derived from the page's `name` field (slugified) or the URL path.

### `--no-screenshots`

Skip all screenshots. Useful for quick checks where only console errors and assertions matter.

### Error handling

- **Missing config:** `"No healthcheck pages defined in browse.config.json."`.
- **Navigation failure for a page:** Record as failed, include the error, continue to next page.
- **Missing variables:** Same validation as flows — list missing variables before running.

---

## CLI Argument Parsing Updates

The new commands follow the established patterns:

```
browse flow list                                              → cmd: "flow",        args: ["list"]
browse flow signup --var base_url=https://example.com         → cmd: "flow",        args: ["signup", "--var", "base_url=https://example.com"]
browse assert visible ".btn"                                  → cmd: "assert",      args: ["visible", ".btn"]
browse assert permission "Create User" granted                → cmd: "assert",      args: ["permission", "Create User", "granted"]
browse healthcheck --var base_url=https://example.com         → cmd: "healthcheck", args: ["--var", "base_url=https://example.com"]
```

`--var` flags use `key=value` syntax (split on first `=`). Multiple `--var` flags are collected into a `Record<string, string>`. This is the first command to accept repeated flags — the parser collects all `--var` instances rather than taking the last one.

---

## Testing Strategy

### Unit tests

- **Variable interpolation:** `{{key}}` replaced correctly, missing vars left as literal, nested `{{` handled gracefully.
- **Flow step parsing:** Each step type maps to the correct command. Invalid step shapes produce clear errors.
- **Assert evaluation:** Each assert subcommand returns correct pass/fail for known page states.
- **Config validation:** Missing flow fields, invalid step types, missing permission fields — all produce specific error messages.
- **Healthcheck reporting:** Correct pass/fail counts, screenshot paths generated correctly, console entries formatted properly.
- **`--var` parsing:** Single var, multiple vars, missing `=`, empty value, value containing `=` (split on first `=` only).

### Integration tests

Spin up a local test server extending the Phase 3 fixture. The test server should:

- Serve pages at `/register`, `/welcome`, `/admin/users/new`, `/admin/users`, `/dashboard`, `/settings`, `/api/health`.
- `/register` has email and password fields and a submit button. On submit, redirect to `/welcome`.
- `/admin/users/new` has a create-user form visible only when a session cookie is present. Without the cookie, shows "Access denied".
- `/settings` includes a JS error on load (for healthcheck console error detection).
- `/api/health` returns plain text `"ok"`.

**Flow tests:**

- `flow list` → verify all configured flows are listed with descriptions and variables.
- `flow signup --var base_url=... --var test_email=... --var test_pass=...` → verify all steps complete, output shows step-by-step report with pass marks.
- `flow signup` (missing variables) → verify clear error listing missing variables.
- `flow nonexistent` → verify unknown flow error.
- Configure a flow with a step that fails → verify fail-fast behaviour (subsequent steps not executed).
- Same failing flow with `--continue-on-error` → verify all steps attempted and failures reported.

**Assert tests:**

- Navigate to test page → `assert visible "h1"` → verify PASS.
- `assert visible ".nonexistent"` → verify FAIL.
- `assert text-contains "Welcome"` on a page containing "Welcome" → verify PASS.
- `assert text-not-contains "Error"` on a clean page → verify PASS.
- `assert url-contains "/dashboard"` after navigating to dashboard → verify PASS.
- `assert element-count "li" 5` on a page with 5 list items → verify PASS.
- `assert element-count "li" 3` on a page with 5 list items → verify FAIL with actual count in message.

**Permission assertion tests:**

- Log in as admin → `assert permission "Create User" granted --var base_url=...` → verify PASS (form visible).
- Without login → `assert permission "Create User" granted --var base_url=...` → verify FAIL ("Access denied" shown).
- Without login → `assert permission "Create User" denied --var base_url=...` → verify PASS.

**Healthcheck tests:**

- `healthcheck --var base_url=...` → verify all pages visited, summary shows correct pass/fail counts.
- Verify the settings page is marked as failed due to console errors.
- Verify screenshots are created for pages where `screenshot` is not `false`.
- `healthcheck --var base_url=... --no-screenshots` → verify no screenshot files created.
- Remove healthcheck config → verify clear error.

### Test fixtures

Extend `test/fixtures/` with:

- `register.html` — registration form with email, password, submit. Redirects to `/welcome` on submit.
- `welcome.html` — confirmation page with "Welcome" text.
- `admin-users-new.html` — create-user form (conditionally visible based on session cookie).
- `settings-with-error.html` — page that throws a JS error on load.
- `health.txt` — plain text "ok" response.
- `browse.config.json` — test config with flows, permissions, and healthcheck definitions.

---

## Acceptance Criteria

1. `browse flow list` shows all configured flows with descriptions and required variables.
2. `browse flow <name> --var key=value` executes the named flow, reporting step-by-step progress.
3. Flow variables are interpolated into all string values in steps.
4. Missing variables are caught before execution with a clear error listing what's needed.
5. Flows fail-fast by default. `--continue-on-error` runs all steps and reports failures at the end.
6. Flow steps that interact with elements (`click`, `fill`, `select`) resolve accessible names via implicit snapshots — no refs in config.
7. `browse assert <condition>` checks the condition against the current page and returns PASS/FAIL.
8. Assert returns exit code 0 on pass, 1 on fail.
9. `browse assert permission <name> granted|denied` navigates to the configured page and checks the permission condition.
10. `browse healthcheck --var base_url=<url>` visits all configured pages, screenshots, checks console, runs assertions, and returns a summary.
11. Healthcheck runs in continue-on-error mode — all pages are visited regardless of individual failures.
12. Healthcheck `--no-screenshots` skips screenshot capture.
13. All commands return human-readable output with clear pass/fail indicators.
14. Phase 4 config extends `browse.config.json` without breaking Phase 3 config.

---

## Resolved Questions

1. **Assertion approach** — General-purpose `assert` command as the foundation, with named `permissions` config as sugar on top. The assert command is reusable beyond permissions (form validation, page state checks, error detection), and permission mappings are essentially navigation + assertion combined. This avoids a single-purpose feature.
2. **Flow composition** — Flows cannot call other flows in Phase 4. A flow can include a `{ "login": "staging" }` step to invoke the Phase 3 login command, but general flow-calls-flow is deferred. Flat flows are simpler to debug and don't require cycle detection.
3. **Flow failure mode** — Fail-fast by default, `--continue-on-error` flag for cases where you want the full picture. Healthcheck always uses continue mode since its purpose is to report on multiple independent pages.
4. **Implicit snapshots in flows** — Flow interaction steps (`click`, `fill`, `select`) use accessible names, not refs. The flow runner takes a snapshot automatically before the first interaction and after any navigation. This is the only sensible approach since refs are ephemeral and meaningless in a config file.
5. **Variable syntax** — `{{key}}` with `--var key=value` CLI flags. Simple, familiar, no library needed. Split on first `=` to allow values containing `=`.
6. **Screenshot storage in flows** — Auto-generated under `~/.bun-browse/screenshots/` with `flow-{name}-step{n}-{timestamp}.png` naming. Explicit paths in screenshot steps are also supported.
7. **Healthcheck failure semantics** — A page "fails" if it has console errors at the configured level OR any assertion fails. Navigation failures are also recorded as failures. The summary lists everything so the agent can triage.
