# Plan 05: Visual Regression Testing Workflow

**Priority:** Tier 1 — High Impact
**Personas:** OSS Maintainer, Designer, QA Engineer
**New commands:** `vrt init`, `vrt check`, `vrt update`, `vrt report`

---

## Problem

`screenshot --diff` compares two arbitrary images, but there's no managed workflow for visual regression testing: maintaining a baseline directory, running checks against it, approving/updating changes, or integrating with CI. Users wanting VRT currently need Chromatic, Percy, or a custom script.

## Design

### Command Interface

```bash
# Initialize VRT in a project (creates .browse/vrt/ directory)
browse vrt init

# Capture baselines from a flow
browse vrt baseline --flow homepage-flow
# Or from explicit URLs
browse vrt baseline --urls https://example.com,https://example.com/about

# Run comparison against baselines
browse vrt check [--threshold 5] [--flow <name>] [--urls <urls>]

# Update baselines (accept current as new baseline)
browse vrt update [--all]
browse vrt update --only "homepage-desktop,about-mobile"

# Generate a visual diff report
browse vrt report [--out vrt-report.html]

# List current baselines
browse vrt list

# Clean up old baselines
browse vrt clean [--older-than 30d]
```

### Directory Structure

```
.browse/
└── vrt/
    ├── config.json              # VRT configuration
    ├── baselines/
    │   ├── homepage-desktop.png
    │   ├── homepage-mobile.png
    │   ├── about-desktop.png
    │   └── about-mobile.png
    ├── current/                  # Latest check results
    │   ├── homepage-desktop.png
    │   ├── homepage-mobile.png
    │   └── ...
    └── diffs/                    # Diff images (red highlights)
        ├── homepage-desktop-diff.png
        └── ...
```

### Configuration (`.browse/vrt/config.json`)

```json
{
  "threshold": 5,
  "viewports": [
    { "name": "mobile", "width": 375, "height": 667 },
    { "name": "desktop", "width": 1440, "height": 900 }
  ],
  "pages": [
    { "name": "homepage", "url": "{{base_url}}/", "flow": null },
    { "name": "dashboard", "url": null, "flow": "login-and-dashboard" }
  ],
  "variables": {
    "base_url": "https://staging.example.com"
  },
  "waitAfterNavigation": "network-idle"
}
```

### Implementation

**File:** `src/commands/vrt.ts` (~200 lines, sub-command dispatcher)
**File:** `src/vrt-engine.ts` (~400 lines)

1. **`vrt init`**:
   - Create `.browse/vrt/` directory structure
   - Generate default `config.json` with common viewports
   - Add `.browse/vrt/current/` and `.browse/vrt/diffs/` to `.gitignore` suggestion
   - Print setup instructions

2. **`vrt baseline`**:
   - For each page × viewport combination:
     - Set viewport dimensions
     - Navigate to URL (or run flow)
     - Wait for `waitAfterNavigation` condition
     - Capture screenshot → `.browse/vrt/baselines/<name>-<viewport>.png`
   - Print: `✓ Captured 8 baselines (4 pages × 2 viewports)`

3. **`vrt check`**:
   - For each page × viewport:
     - Capture current screenshot → `.browse/vrt/current/<name>-<viewport>.png`
     - Compare against baseline using existing `visual-diff.ts`
     - If diff exceeds threshold: generate diff image → `.browse/vrt/diffs/`
   - Print summary:
     ```
     VRT Check Results:
     ✓ homepage-desktop    99.8% match
     ✓ homepage-mobile     99.5% match
     ✗ dashboard-desktop   87.3% match (threshold: 95%)  → .browse/vrt/diffs/dashboard-desktop-diff.png
     ✓ dashboard-mobile    98.1% match

     1 of 4 checks failed. Run `browse vrt report` for details.
     ```
   - Exit code: 0 if all pass, 1 if any fail (CI-friendly)

4. **`vrt update`**:
   - `--all`: copy all current screenshots to baselines
   - `--only <names>`: copy specific ones
   - Confirm before overwriting: `Update 3 baselines? (y/n)`
   - Print what was updated

5. **`vrt report`**:
   - Generate HTML report using existing `report.ts` infrastructure
   - For each page × viewport: show baseline, current, and diff side-by-side
   - Highlight failures in red
   - Include metadata: timestamp, threshold, viewport, URL

6. **`vrt list`**:
   - List all baselines with file sizes and last-modified dates

### Flow Integration

VRT can be triggered as a flow step:

```json
{
  "steps": [
    { "login": "staging" },
    { "vrt": "check" }
  ]
}
```

### CI Integration

```yaml
# GitHub Actions example
- name: Visual regression check
  run: |
    browse vrt check --threshold 5
  env:
    BROWSE_BASE_URL: ${{ env.STAGING_URL }}
```

On failure, the action can upload `.browse/vrt/diffs/` as artifacts.

## Testing

**File:** `test/vrt.test.ts`

- Test init creates correct directory structure
- Test baseline capture with mock page/screenshot
- Test check comparison logic and threshold
- Test update copies correct files
- Test report generation
- Test exit codes (0 pass, 1 fail)

## Dependencies

- Reuses `visual-diff.ts` for image comparison (already implemented)
- Reuses `responsive.ts` viewport logic
- Reuses `report.ts` for HTML generation
- No new npm dependencies

## Estimated Scope

- `src/commands/vrt.ts` — ~200 lines
- `src/vrt-engine.ts` — ~400 lines
- `test/vrt.test.ts` — ~250 lines
- Help, protocol, daemon wiring — ~60 lines
