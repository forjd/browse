# Accessibility Auditing

## Overview

The `browse a11y` command runs accessibility audits powered by [axe-core](https://github.com/dequelabs/axe-core) via `@axe-core/playwright`. It checks pages against WCAG standards and reports violations grouped by severity.

## Basic Usage

```sh
browse a11y                       # full page audit, human-readable output
browse a11y --json                # machine-readable output for CI
```

## WCAG Standards

```sh
browse a11y --standard wcag2a     # WCAG 2.0 Level A
browse a11y --standard wcag2aa    # WCAG 2.0 Level AA (most common target)
browse a11y --standard wcag21a    # WCAG 2.1 Level A
browse a11y --standard wcag21aa   # WCAG 2.1 Level AA
browse a11y --standard wcag22aa   # WCAG 2.2 Level AA
browse a11y --standard best-practice  # axe-core best practices
```

Without `--standard`, axe-core runs all rules.

## Scoping Audits

### By Ref

```sh
browse snapshot
browse a11y @e5                   # audit a specific element by ref
```

### By CSS Selector

```sh
browse a11y --include ".main-content"    # audit only this region
browse a11y --exclude ".third-party-ads" # exclude a region
```

### Combining

```sh
browse a11y --include ".main" --exclude ".ads"
```

## Output Format

### Human-Readable (default)

Violations are grouped by severity (critical, serious, moderate, minor). Each violation shows:

- Rule name and description
- Affected elements
- Link to fix guidance (from axe-core)

### JSON (`--json`)

Returns structured JSON output suitable for CI pipelines and automated processing. Includes full violation details, nodes, and help URLs.

## CI Integration

Use `--json` output with a CI script to fail builds on accessibility violations:

```sh
# Fail if any critical or serious violations
browse goto https://staging.example.com
result=$(browse a11y --standard wcag2aa --json)
# Parse JSON result to check for violations
```

The command returns a non-zero exit code on failure (e.g., if axe-core itself fails), but violations are reported in the output, not as exit codes. Use `--json` output parsing to enforce thresholds.

## Best Practices

- Run `a11y` on key pages as part of your QA workflow.
- Use `--standard wcag2aa` for most projects (the most common compliance target).
- Use `--include` to focus on your content, `--exclude` to skip third-party widgets.
- Use `--json` in CI to track violations over time.
- Audit after significant DOM changes (SPAs: after navigation and render).
- Combine with `browse snapshot` to understand page structure before auditing.

## Limitations

- axe-core is a static analysis tool — it catches roughly 30–40% of WCAG issues automatically.
- Some violations require manual review (colour contrast in images, meaningful link text, etc.).
- Dynamic content (modals, tooltips) needs to be triggered before auditing.

## See Also

- [Commands Reference](commands.md)
- [The Ref System](refs.md)
