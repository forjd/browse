# Plan 16: Design Token Audit

**Priority:** Tier 3 — Lower Impact / Niche
**Personas:** Designer, Design System Lead
**New commands:** `design-audit`

---

## Problem

Designers maintain design tokens (colors, fonts, spacing) in a tokens file, but have no automated way to verify that the live application actually uses them. Computed styles drift from design specs over time, and no one notices until a redesign audit.

## Design

### Command Interface

```bash
# Audit page against a design tokens file
browse design-audit --tokens design-tokens.json

# Audit specific categories
browse design-audit --tokens tokens.json --check colors,fonts

# Audit a specific component
browse design-audit --tokens tokens.json --selector ".card-component"

# Export extracted styles (no comparison, just extraction)
browse design-audit --extract --output extracted-styles.json

# JSON output
browse design-audit --tokens tokens.json --json

# HTML report with visual swatches
browse design-audit --tokens tokens.json --report design-report.html
```

### Design Tokens File Format

Support common token formats:

```json
{
  "colors": {
    "primary": "#1a73e8",
    "secondary": "#5f6368",
    "error": "#d93025",
    "background": "#ffffff",
    "text": "#202124"
  },
  "fonts": {
    "heading": "Inter, sans-serif",
    "body": "Roboto, sans-serif",
    "mono": "Fira Code, monospace"
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px"
  },
  "borderRadius": {
    "sm": "4px",
    "md": "8px",
    "lg": "16px"
  },
  "fontSize": {
    "xs": "12px",
    "sm": "14px",
    "base": "16px",
    "lg": "18px",
    "xl": "24px",
    "2xl": "32px"
  }
}
```

Also support Style Dictionary format and CSS custom properties extraction.

### Audit Process

1. **Extract computed styles** from the live page via `page.evaluate()`:
   - Sample all visible elements (or scoped to `--selector`)
   - For each element: `getComputedStyle()` for color, font-family, font-size, padding, margin, border-radius
   - Deduplicate: group by computed value, count occurrences

2. **Compare against tokens**:
   - For each extracted color: find nearest token color (using CIEDE2000 color distance)
   - Flag colors that don't match any token within threshold
   - For fonts: check if font-family matches a token value
   - For spacing/sizing: check if values match defined scale

3. **Report drift**:
   - Colors used on the page that aren't in the token set
   - Token colors that are never used (dead tokens)
   - Font families not in the token set
   - Font sizes not on the defined scale
   - Off-scale spacing values

### Output

```
Design Token Audit: https://example.com/dashboard
Tokens: design-tokens.json (5 colors, 3 fonts, 5 spacing values)

Colors
  ✓ #1a73e8 (primary) — used 24 times
  ✓ #5f6368 (secondary) — used 18 times
  ✓ #d93025 (error) — used 3 times
  ⚠ #1a6dd4 — not in tokens (closest: primary #1a73e8, ΔE=4.2)
  ⚠ #333333 — not in tokens (closest: text #202124, ΔE=8.1)
  Dead tokens: none

Fonts
  ✓ Inter — used for headings (matches "heading" token)
  ✓ Roboto — used for body text (matches "body" token)
  ✗ Arial — found on 3 elements, not in tokens

Font Sizes
  ✓ 14px (sm), 16px (base), 24px (xl) — all on scale
  ⚠ 15px — off scale (closest: 14px sm or 16px base)

Spacing
  ✓ 8px, 16px, 24px — on scale
  ⚠ 12px — off scale (between xs=4px and md=16px)
  ⚠ 20px — off scale (between md=16px and lg=24px)

Summary: 2 color drifts, 1 rogue font, 1 off-scale size, 2 off-scale spacings
```

### Implementation

**File:** `src/commands/design-audit.ts` (~200 lines)
**File:** `src/design-engine.ts` (~400 lines)

1. **Style extraction** (`page.evaluate`):
   - Query all visible elements (or scoped selector)
   - Extract computed styles: `color`, `backgroundColor`, `fontFamily`, `fontSize`, `padding*`, `margin*`, `borderRadius`
   - Return as flat array of `{ selector, property, value }` tuples
   - Deduplicate by value, count occurrences

2. **Color comparison**:
   - Parse hex/rgb/hsl to Lab color space
   - Use CIEDE2000 formula for perceptual distance (~50 lines)
   - Threshold: ΔE < 3 = match, 3-10 = close, >10 = no match

3. **Token matching**:
   - For each extracted value, find the best matching token
   - Report unmatched values and unused tokens

4. **Report generation**:
   - Text output with color swatches (terminal colors where supported)
   - JSON for programmatic use
   - HTML report with actual color swatches, side-by-side comparisons

## Testing

**File:** `test/design-audit.test.ts`

- Test color distance calculation (known CIEDE2000 values)
- Test token matching logic
- Test style extraction with mock page
- Test dead token detection
- Test various token file formats

## Dependencies

- No new dependencies (CIEDE2000 is ~50 lines of math)

## Estimated Scope

- `src/commands/design-audit.ts` — ~200 lines
- `src/design-engine.ts` — ~400 lines
- `test/design-audit.test.ts` — ~200 lines
- Help, protocol, daemon wiring — ~50 lines
