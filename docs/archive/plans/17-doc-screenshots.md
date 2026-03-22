# Plan 17: Automated Doc Screenshots with Annotations

**Priority:** Tier 3 — Lower Impact / Niche
**Personas:** Technical Writer, Documentation Author
**New commands:** `doc-capture`

---

## Problem

Software documentation requires up-to-date screenshots with annotations (numbered callouts, arrows, highlights). This is the most tedious part of writing docs — manually capturing, cropping, annotating, and updating screenshots every time the UI changes.

## Design

### Command Interface

```bash
# Capture screenshots from a doc-capture flow
browse doc-capture --flow docs-flow.json --output docs/images/

# With annotation (auto-number interactive elements)
browse doc-capture --flow docs-flow.json --annotate --output docs/images/

# Generate markdown image references
browse doc-capture --flow docs-flow.json --output docs/images/ --markdown docs/screenshots.md

# Update existing doc screenshots (re-run same flow)
browse doc-capture --flow docs-flow.json --output docs/images/ --update
```

### Doc-Capture Flow Format

Extended flow format with annotation directives:

```json
{
  "name": "getting-started-docs",
  "variables": ["base_url"],
  "steps": [
    {
      "goto": "{{base_url}}/login",
      "capture": {
        "filename": "01-login-page",
        "alt": "The login page with email and password fields",
        "highlight": ["Email", "Password", "Sign in"],
        "caption": "Enter your credentials and click Sign in"
      }
    },
    {
      "fill": { "Email": "admin@example.com", "Password": "secret" },
      "click": "Sign in"
    },
    {
      "wait": { "urlContains": "/dashboard" },
      "capture": {
        "filename": "02-dashboard",
        "alt": "The main dashboard showing key metrics",
        "highlight": ["Navigation menu", "Metrics panel"],
        "arrows": [
          { "from": "Navigation menu", "label": "1. Click any section" },
          { "to": "Metrics panel", "label": "2. View real-time data" }
        ]
      }
    }
  ]
}
```

### Annotation Types

| Type | Description |
|------|-------------|
| `highlight` | Draw a colored rectangle around named elements |
| `arrows` | Draw labeled arrows pointing to/from elements |
| `number` | Auto-number highlighted elements (①, ②, ③) |
| `blur` | Blur sensitive areas (PII, tokens) |
| `crop` | Crop to a specific region or element |
| `callout` | Add a text callout box near an element |

### Implementation

**File:** `src/commands/doc-capture.ts` (~200 lines)
**File:** `src/doc-annotator.ts` (~400 lines)

1. **Flow execution**:
   - Run flow using existing `flow-runner.ts`
   - At each step with a `capture` directive, pause and:
     a. Capture full-page screenshot
     b. If annotations requested, process them
     c. Save to output directory

2. **Annotation rendering** (`src/doc-annotator.ts`):
   - Load screenshot as pixel buffer
   - For `highlight`: get element bounding box via `page.evaluate()`, draw colored rounded rectangle overlay
   - For `arrows`: calculate start/end points from element positions, draw arrow with label
   - For `number`: overlay numbered circles (①②③) at element positions
   - For `blur`: apply Gaussian blur to element region
   - For `crop`: trim image to bounding box of specified element + padding
   - Use canvas-like operations (via `sharp` or raw pixel manipulation)

3. **Markdown generation** (`--markdown`):
   - For each captured screenshot, generate:
     ```markdown
     ![The login page with email and password fields](images/01-login-page.png)
     *Enter your credentials and click Sign in*
     ```
   - Write to specified markdown file

4. **Update mode** (`--update`):
   - Re-run the same flow
   - Compare new screenshots with existing ones
   - Only overwrite if changed (avoids unnecessary git diffs)
   - Print: `Updated 3 of 8 screenshots (5 unchanged)`

### Output

```
Doc Capture: getting-started-docs
  ✓ 01-login-page.png (1440x900, annotated: 3 highlights)
  ✓ 02-dashboard.png (1440x900, annotated: 2 highlights, 2 arrows)
  ✓ 03-settings.png (1440x900, cropped to settings panel)

Saved 3 screenshots to docs/images/
Generated docs/screenshots.md with 3 image references
```

### Directory Output

```
docs/images/
├── 01-login-page.png
├── 01-login-page-raw.png    # Unannotated original (for re-annotation)
├── 02-dashboard.png
├── 02-dashboard-raw.png
└── 03-settings.png
```

## Testing

**File:** `test/doc-capture.test.ts`

- Test flow execution with capture directives
- Test annotation bounding box calculation
- Test markdown generation format
- Test update mode (change detection)
- Test crop and blur operations

## Dependencies

- Consider `sharp` for image manipulation (already common in Node ecosystems)
- Alternatively, use Playwright's built-in screenshot + canvas overlay via `page.evaluate()`

## Estimated Scope

- `src/commands/doc-capture.ts` — ~200 lines
- `src/doc-annotator.ts` — ~400 lines
- `test/doc-capture.test.ts` — ~200 lines
- Help, protocol, daemon wiring — ~50 lines
