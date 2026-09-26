# BDD with Cucumber/Gherkin

Browse integrates with Cucumber by **shipping step definitions, not by running
`.feature` files itself**. `cucumber-js` stays in charge of Gherkin parsing,
tags, hooks, data tables, scenario outlines, and reporting; the generated step
definitions shell out to the Browse CLI, exactly like the Vitest and Jest
starters do.

That means you keep the whole Cucumber ecosystem — `--tags`, profiles, the HTML
and JSON formatters, `@cucumber/pretty-formatter`, CI integrations — and Browse
stays a CLI rather than growing a second test runner.

## Quick start

```bash
browse framework init cucumber
npm install --save-dev @cucumber/cucumber
cucumber-js --config tests/cucumber.cjs
```

That gives you a green run out of the box:

```
......

1 scenario (1 passed)
6 steps (6 passed)
```

To see how a red run reports, run the `failing` profile — the scaffold ships an
intentionally-failing scenario tagged `@failing-example`:

```bash
cucumber-js --config tests/cucumber.cjs --profile failing
```

```
...F.

Failed scenarios:
  1) A missing string fails the run # tests/features/browse.feature:17
       Then the page should contain "This text is not on the page" # tests/step-definitions/browse.steps.cjs:88
           Error: Error: FAIL: text-contains "This text is not on the page"
             → Page text does not contain "This text is not on the page".

1 scenario (1 failed)
5 steps (4 passed, 1 failed)
```

The Browse assertion message comes through verbatim, so a failing Gherkin step
tells you exactly which `browse assert` failed and why.

## What gets scaffolded

```
tests/
├── browse-harness.cjs            # spawns the browse binary (shared with vitest/jest)
├── cucumber.cjs                  # default + failing profiles
├── features/
│   └── browse.feature            # starter scenarios
└── step-definitions/
    └── browse.steps.cjs          # generated step definitions
```

Use `--dir <path>` to scaffold somewhere else (`browse framework init cucumber
--dir bdd`) and `--force` to regenerate over existing files.

### The starter feature

```gherkin
Feature: Browse smoke test
  As a QA engineer
  I want to drive Browse from Gherkin
  So that non-engineers can read the test suite

  Background:
    Given browse is ready

  Scenario: The example homepage loads
    When I open "https://example.com"
    Then the page should contain "Example Domain"
    And the URL should contain "example.com"
```

### The generated step definitions

Every step is a thin wrapper around a Browse command:

```js
// Navigate to a URL.
When("I open {string}", async function (url) {
	await this.browse.run(["goto", url]);
});

// Assert visible page text contains a string.
Then("the page should contain {string}", async function (text) {
	await this.browse.run(["assert", "text-contains", text]);
});
```

The harness rejects on a non-zero exit code, so a failed `browse assert` fails
the Gherkin step with Browse's own error message. A `World` constructor gives
each scenario its own harness, and a `Before` hook runs `browse ping` so the
daemon is warm before the first real step.

Cucumber's default step timeout is 5 seconds, which a cold daemon start can
exceed. The generated file raises it with `setDefaultTimeout(60000)`.

## Step reference

| Gherkin step | Browse command |
|--------------|----------------|
| `Given browse is ready` | `browse ping` |
| `Given a clean browser session` | `browse wipe` |
| `When I open "<url>"` | `browse goto <url>` |
| `When I take a snapshot` | `browse snapshot` |
| `When I click "<ref>"` | `browse click <ref>` |
| `When I fill "<ref>" with "<value>"` | `browse fill <ref> <value>` |
| `When I select "<option>" in "<ref>"` | `browse select <ref> <option>` |
| `When I press "<key>"` | `browse press <key>` |
| `When I wait for "<selector>" to be visible` | `browse wait visible <selector>` |
| `When I wait until the page contains "<text>"` | `browse wait text <text>` |
| `Then the page should contain "<text>"` | `browse assert text-contains <text>` |
| `Then the page should not contain "<text>"` | `browse assert text-not-contains <text>` |
| `Then "<selector>" should be visible` | `browse assert visible <selector>` |
| `Then "<selector>" should not be visible` | `browse assert not-visible <selector>` |
| `Then the URL should contain "<substring>"` | `browse assert url-contains <substring>` |
| `Then the URL should match "<pattern>"` | `browse assert url-pattern <pattern>` |
| `Then I save a screenshot to "<path>"` | `browse screenshot <path>` |

Steps that take a `<ref>` need refs from `browse snapshot`. Take a snapshot
first, then use the `@e12`-style handles it prints:

```gherkin
Scenario: Search from the homepage
  When I open "https://example.com/search"
  And I take a snapshot
  And I fill "@e3" with "browser automation"
  And I press "Enter"
  And I wait for "#results" to be visible
  Then the page should contain "results for"
```

See [The Ref System](refs.md) for how refs are allocated and when they go stale.

## Writing your own steps

Add steps below the generated block in `browse.steps.cjs`, or in a new file
alongside it — the config globs `tests/step-definitions/*.cjs`. `this.browse` is
available in every step:

```js
Then("the page title should be {string}", async function (expected) {
	const result = await this.browse.run(["title"]);
	if (result.stdout.trim() !== expected) {
		throw new Error(`Expected title "${expected}", got "${result.stdout.trim()}"`);
	}
});
```

`this.browse.run(args, { allowFailure: true })` resolves instead of rejecting on
a non-zero exit, which is what you want when the failure *is* the assertion.

## Pointing at a local build

The harness respects `BROWSE_BIN`, so you can test an uninstalled build:

```bash
BROWSE_BIN=./dist/browse cucumber-js --config tests/cucumber.cjs
```

## Cucumber-shaped output from Browse flows

The reverse direction also works: `--reporter cucumber` renders a Browse
[flow](flows-and-healthchecks.md) as Cucumber JSON, so a dashboard that already
ingests `cucumber-js --format json` can read Browse flows without a Cucumber
runner at all.

```bash
browse flow smoke --reporter cucumber
```

```json
[
  {
    "keyword": "Feature",
    "name": "smoke",
    "id": "smoke",
    "uri": "smoke.feature",
    "line": 1,
    "elements": [
      {
        "keyword": "Scenario",
        "name": "smoke",
        "id": "smoke;smoke",
        "type": "scenario",
        "line": 2,
        "steps": [
          {
            "keyword": "Given ",
            "name": "goto https://example.com",
            "line": 3,
            "result": { "status": "passed", "duration": 24666667 }
          },
          {
            "keyword": "Then ",
            "name": "assert textContains \"definitely not here\"",
            "line": 4,
            "result": {
              "status": "failed",
              "duration": 24666667,
              "error_message": "Page text does not contain \"definitely not here\"."
            }
          }
        ]
      }
    ]
  }
]
```

Each flow becomes one feature with one scenario; each flow step becomes a
Gherkin step. Durations are per-step averages in nanoseconds, matching
Cucumber's JSON formatter.

## In CI

The [official GitHub Action](../.github/actions/browse/action.yml) installs Browse
and its browser, so a Cucumber job is just the runner:

```yaml
- uses: actions/checkout@v4
- uses: forjd/browse/.github/actions/browse@main
- run: npm ci
- run: npx cucumber-js --config tests/cucumber.cjs --format json:reports/cucumber.json
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: cucumber-report
    path: reports/
```

## Next steps

- [Commands Reference](commands.md) — every command the step definitions can call
- [The Ref System](refs.md) — refs used by the click/fill/select steps
- [Flows and Healthchecks](flows-and-healthchecks.md) — Browse's own scenario format
- [Plugins](plugins.md) — custom reporters, including BDD-shaped ones
