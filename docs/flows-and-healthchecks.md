# Flows and Healthchecks

## Flows

### What Are Flows?

Reusable browser automation sequences defined in `browse.config.json` or as individual JSON files in a `flows/` directory. Run them with `browse flow <name>`. Useful for:

- Repeatable test scenarios (signup, checkout, onboarding)
- Smoke tests before deployment
- Regression testing of critical paths

### Defining a Flow

#### Inline (in browse.config.json)

```json
{
  "flows": {
    "signup": {
      "description": "Test the signup flow",
      "variables": ["base_url", "test_email"],
      "steps": [
        { "goto": "{{base_url}}/register" },
        { "fill": { "Email": "{{test_email}}" } },
        { "click": "Submit" },
        { "wait": { "urlContains": "/welcome" } },
        { "assert": { "textContains": "Welcome" } },
        { "screenshot": true }
      ]
    }
  }
}
```

#### File-based (in flows/ directory)

For better readability and maintainability, flows can be defined as individual JSON files in a `flows/` directory next to your `browse.config.json`. The flow name is derived from the filename (minus `.json`).

```
project/
├── browse.config.json
└── flows/
    ├── signup.json
    ├── checkout.json
    └── smoke-test.json
```

Each file contains a bare flow definition — the same shape as what goes inside the `flows` object in the config:

```json
// flows/signup.json
{
  "description": "Test the signup flow",
  "variables": ["base_url", "test_email"],
  "steps": [
    { "goto": "{{base_url}}/register" },
    { "fill": { "Email": "{{test_email}}" } },
    { "click": "Submit" },
    { "wait": { "urlContains": "/welcome" } },
    { "assert": { "textContains": "Welcome" } },
    { "screenshot": true }
  ]
}
```

#### Global flows

Flows placed in `~/.browse/flows/` are available across all projects.

#### Precedence

When the same flow name exists in multiple locations, the following precedence applies:

1. **Inline** (in `browse.config.json`) — highest priority
2. **Local files** (in `flows/` next to config)
3. **Global files** (in `~/.browse/flows/`) — lowest priority

`browse flow list` shows the source of each flow so you can see where it comes from.

### Running Flows

```sh
browse flow list                          # list all defined flows
browse flow signup --var base_url=https://staging.example.com --var test_email=test@example.com
browse flow signup --var base_url=https://staging.example.com --continue-on-error
browse flow signup --reporter junit > results.xml   # JUnit XML output for CI
browse flow signup --dry-run              # preview steps without executing
browse flow signup --stream               # real-time NDJSON output per step
```

### Variables

- Declared in `variables` array (optional, for documentation)
- Passed via `--var key=value` (repeatable)
- Interpolated with `{{varName}}` syntax into all string values in steps
- Unresolved variables are left as-is (not an error)

### Step Types

All 13 step types are listed below.

| Step | Description | Example |
|------|-------------|---------|
| `goto` | Navigate to URL | `{ "goto": "{{base_url}}/login" }` |
| `click` | Click element by accessible name | `{ "click": "Submit" }` |
| `fill` | Fill inputs by accessible name | `{ "fill": { "Email": "test@example.com" } }` |
| `select` | Select dropdown by accessible name | `{ "select": { "Country": "United Kingdom" } }` |
| `screenshot` | Capture page | `{ "screenshot": true }` or `{ "screenshot": "/path/to/file.png" }` |
| `console` | Check console messages | `{ "console": "error" }` or `"warning"` or `"all"` |
| `network` | Check network requests | `{ "network": true }` |
| `wait` | Wait for condition | `{ "wait": { "urlContains": "/dashboard" } }` |
| `assert` | Assert condition | `{ "assert": { "visible": ".success-message" } }` |
| `login` | Log in via environment | `{ "login": "staging" }` |
| `snapshot` | Take accessibility snapshot | `{ "snapshot": true }` |
| `if` | Conditional branch | `{ "if": { "condition": { "elementVisible": ".modal" }, "then": [...], "else": [...] } }` |
| `while` | Loop while condition holds | `{ "while": { "condition": { "elementVisible": ".next" }, "steps": [...], "maxIterations": 100 } }` |

`click`, `fill`, and `select` also support an [object form for disambiguation](#disambiguation) when multiple elements share the same name.

**Important**: `click` and `fill` in flows use **accessible names** (not CSS selectors or refs) by default. The flow runner looks for elements by role:

- `click` tries: button, link, menuitem, tab
- `fill` tries: textbox, searchbox, combobox, spinbutton
- `select` tries: combobox, then falls back to label

### Disambiguation

When a page has multiple elements with the same accessible name (e.g., several "Yes"/"No" button pairs), the simple string form always clicks the first match. Use the object form to target a specific element:

#### By index (nth match, zero-based)

```json
{ "click": { "name": "Yes", "index": 1 } }
```

Clicks the **second** "Yes" button. Works with `fill` and `select` too:

```json
{ "fill": { "Email": { "value": "user@example.com", "index": 1 } } }
```

#### By proximity (`click` only)

```json
{ "click": { "name": "Yes", "near": "Are you selling a property?" } }
```

Finds all elements matching the name, then clicks the one **nearest** (by pixel distance) to the specified text on the page. This mirrors how a human reads the page: "click Yes under the selling question."

`index` and `near` are mutually exclusive — use one or the other.

#### By CSS selector (escape hatch)

```json
{ "click": { "selector": ".question-2 button:first-child" } }
{ "fill": { "selector": "input.email", "value": "user@example.com" } }
{ "select": { "selector": "#country", "value": "United Kingdom" } }
```

Use when accessible names are insufficient. The `selector` form bypasses role-based matching entirely.

### Wait Conditions

| Condition | Example |
|-----------|---------|
| URL contains | `{ "urlContains": "/dashboard" }` |
| URL matches regex | `{ "urlPattern": "^https://.*\\.example\\.com" }` |
| Element visible | `{ "elementVisible": ".success" }` |
| Text visible | `{ "textVisible": "Welcome back" }` |
| Fixed delay | `{ "timeout": 2000 }` |

### Assert Conditions

| Condition | Example |
|-----------|---------|
| Element visible | `{ "visible": ".dashboard" }` |
| Element not visible | `{ "notVisible": ".spinner" }` |
| Text contains | `{ "textContains": "Welcome" }` |
| Text not contains | `{ "textNotContains": "Error" }` |
| URL contains | `{ "urlContains": "/dashboard" }` |
| URL matches regex | `{ "urlPattern": "^https://" }` |
| Element text | `{ "elementText": { "selector": "h1", "contains": "Dashboard" } }` |
| Element count | `{ "elementCount": { "selector": ".item", "count": 5 } }` |

### Flow Output

Flows produce a step-by-step report:

```
Flow: signup (6/6 steps completed)

  ✓ Step 1: goto https://staging.example.com/register
  ✓ Step 2: fill Email
  ✓ Step 3: click Submit
  ✓ Step 4: wait urlContains "/welcome"
  ✓ Step 5: assert textContains "Welcome"
  ✓ Step 6: screenshot
    → ~/.bun-browse/screenshots/flow-signup-step6-20260315-142030-123.png

Screenshots:
  Step 6: ~/.bun-browse/screenshots/flow-signup-step6-20260315-142030-123.png
```

### JUnit Output

Use `--reporter junit` to output flow results as JUnit XML, suitable for CI systems (GitHub Actions, Jenkins, GitLab CI):

```sh
browse flow smoke-test --reporter junit > test-results.xml
```

The XML includes a `<testsuite>` with one `<testcase>` per step, including `<failure>` elements for failed steps with error messages.

### Conditional Steps

Flows support `if`/`else` branching and `while` loops using `FlowCondition`:

```json
{
  "steps": [
    { "goto": "{{base_url}}" },
    {
      "if": {
        "condition": { "elementVisible": ".cookie-banner" },
        "then": [
          { "click": "Accept cookies" }
        ]
      }
    },
    {
      "while": {
        "condition": { "elementVisible": ".load-more" },
        "steps": [
          { "click": "Load more" },
          { "wait": { "timeout": 1000 } }
        ],
        "maxIterations": 100
      }
    }
  ]
}
```

**Flow conditions:**

| Condition | Description |
|-----------|-------------|
| `urlContains` | Current URL includes substring |
| `urlPattern` | Current URL matches regex |
| `elementVisible` | CSS selector matches a visible element |
| `elementNotVisible` | CSS selector matches no visible element |
| `textVisible` | Page text includes string |

`while` loops have a built-in safety limit of 10 iterations to prevent infinite loops. Set `maxIterations` to tune this limit.

### Dry Run

Preview flow steps without executing them:

```sh
browse flow signup --dry-run
```

Returns a numbered list of steps with descriptions, useful for verifying flow definitions.

### Streaming Output

Get real-time NDJSON output as each step completes:

```sh
browse flow smoke-test --stream
```

Each line is a JSON object with step index, description, status, and timing.

### Webhook Notifications

Send results to an external URL on completion:

```sh
browse flow smoke-test --webhook https://hooks.slack.com/services/T.../B.../xxx
browse flow checkout --webhook https://your-ci.example.com/callback --continue-on-error
```

The `--webhook` flag POSTs a JSON payload when the flow finishes:

```json
{
  "type": "flow",
  "name": "smoke-test",
  "status": "passed",
  "summary": { "total": 5, "passed": 5, "failed": 0 },
  "duration_ms": 1234,
  "failures": [],
  "timestamp": "2026-03-19T12:00:00.000Z"
}
```

Failed flows include failure details:

```json
{
  "failures": [
    { "step": 3, "error": "Assertion failed: expected 'Dashboard' in title" }
  ]
}
```

The webhook is fire-and-forget — network errors or non-2xx responses are silently ignored so they never block command output.

### Error Handling

- By default, a flow stops on the first failure
- `--continue-on-error` flag continues through all steps, marking failures
- Failed steps show the error message in the report

### Screenshots in Flows

- `{ "screenshot": true }` auto-generates a path: `~/.bun-browse/screenshots/flow-<name>-step<N>-<timestamp>.png`
- `{ "screenshot": "/path/to/file.png" }` saves to a specific path

## Healthchecks

### What Are Healthchecks?

A quick pass/fail check across multiple pages. Defined in `browse.config.json`, run with `browse healthcheck`.

### Defining a Healthcheck

```json
{
  "healthcheck": {
    "pages": [
      {
        "url": "{{base_url}}/dashboard",
        "name": "Dashboard",
        "screenshot": true,
        "console": "error"
      },
      {
        "url": "{{base_url}}/settings",
        "name": "Settings",
        "assertions": [
          { "visible": ".settings-form" },
          { "textContains": "Account Settings" }
        ]
      }
    ]
  }
}
```

### Running Healthchecks

```sh
browse healthcheck --var base_url=https://staging.example.com
browse healthcheck --var base_url=https://staging.example.com --no-screenshots
browse healthcheck --reporter junit > healthcheck-results.xml   # JUnit XML for CI
browse healthcheck --parallel --concurrency 4                    # check pages concurrently
```

### Per-Page Options

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Required. Page URL (supports variable interpolation) |
| `name` | string | Optional label for the page |
| `screenshot` | boolean | Capture screenshot after loading |
| `console` | `"error"` or `"warning"` | Check for console messages at this level |
| `assertions` | AssertCondition[] | Assertions to verify after loading |

### Flags

- `--var key=value` -- Pass variables for URL interpolation (repeatable)
- `--no-screenshots` -- Skip screenshot capture
- `--reporter junit` -- Output results as JUnit XML for CI integration
- `--parallel` -- Check pages concurrently instead of sequentially
- `--concurrency N` -- Max concurrent pages when `--parallel` is set (default: 5)
- `--webhook <url>` -- POST a JSON result payload to the URL on completion

### Webhook Notifications

Send healthcheck results to an external URL on completion:

```sh
browse healthcheck --var base_url=https://staging.example.com --webhook https://hooks.slack.com/services/T.../B.../xxx
```

The `--webhook` flag POSTs a JSON payload when the healthcheck finishes:

```json
{
  "type": "healthcheck",
  "status": "failed",
  "summary": { "total": 3, "passed": 2, "failed": 1 },
  "duration_ms": 2500,
  "failures": [
    { "page": "API Health", "error": "Navigation failed: net::ERR_CONNECTION_REFUSED" }
  ],
  "timestamp": "2026-03-19T12:00:00.000Z"
}
```

## See Also

- [Configuration](configuration.md)
- [Authentication](authentication.md)
- [Commands Reference](commands.md)
