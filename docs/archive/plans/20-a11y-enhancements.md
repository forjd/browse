# Plan 20: Accessibility Enhancements

**Priority:** Tier 3 — Lower Impact / Niche
**Personas:** Accessibility Specialist
**New sub-commands:** `a11y coverage`, `a11y tree`, `a11y tab-order`, `a11y --remediate`

---

## Problem

The `a11y` command runs axe-core and reports violations, but it doesn't provide: a coverage report (how much of the page has proper ARIA), remediation suggestions with code fixes, keyboard navigation auditing, heading hierarchy analysis, or a full accessibility tree export.

## Design

### Command Interface

```bash
# Existing: run axe-core audit
browse a11y [--standard wcag22aa]

# NEW: coverage report
browse a11y coverage [url]

# NEW: with remediation suggestions
browse a11y --remediate

# NEW: keyboard navigation audit
browse a11y tab-order [url]

# NEW: full accessibility tree export
browse a11y tree [--json]

# NEW: heading hierarchy check
browse a11y headings [url]

# JSON output for all sub-commands
browse a11y coverage --json
```

### 1. Coverage Report (`a11y coverage`)

Analyze how well the page's interactive elements are described for assistive technology.

**Checks:**
- % of interactive elements with accessible names
- % of images with alt text
- % of form inputs with labels
- Landmark usage: does the page use `<main>`, `<nav>`, `<header>`, `<footer>`?
- ARIA role usage: count of elements with explicit roles
- Live region coverage: any `aria-live` regions for dynamic content?

**Output:**
```
Accessibility Coverage: https://example.com/dashboard

Element Coverage:
  Interactive elements: 42 found
    ✓ 38/42 (90%) have accessible names
    ✗ 4 elements missing accessible names:
      - button at .toolbar > button:nth-child(3) — no text, no aria-label
      - link at .sidebar > a:nth-child(5) — empty text
      - input at #search-form > input — no label
      - select at .filter-bar > select — no label

  Images: 15 found
    ✓ 12/15 (80%) have alt text
    ✗ 3 missing alt text

  Form inputs: 8 found
    ✓ 6/8 (75%) have associated labels

Landmarks:
  ✓ <main> present
  ✓ <nav> present
  ✗ <header> missing (consider wrapping site header)
  ✗ <footer> missing

Overall coverage score: 82%
```

### 2. Remediation Suggestions (`--remediate`)

When added to any `a11y` sub-command, include code fix suggestions for each issue.

**Example:**
```
Violation: button missing accessible name
  Element: <button class="icon-btn"><svg>...</svg></button>
  Location: .toolbar > button:nth-child(3)

  Suggested fix (pick one):
    a) Add aria-label:
       <button class="icon-btn" aria-label="Settings"><svg>...</svg></button>
    b) Add visible text:
       <button class="icon-btn"><svg>...</svg> Settings</button>
    c) Add title attribute:
       <button class="icon-btn" title="Settings"><svg>...</svg></button>
```

### 3. Keyboard Navigation Audit (`a11y tab-order`)

Verify that all interactive elements are keyboard-accessible and in a logical order.

**Method:**
1. Focus the first element (`page.keyboard.press('Tab')`)
2. For each Tab press:
   - Record which element received focus
   - Check if focus indicator is visible (outline/border change)
   - Record position (for order validation)
3. Continue until focus cycles back to start or max iterations reached
4. Analyze:
   - Skip detection: are any interactive elements unreachable by Tab?
   - Order: does tab order follow visual layout (left→right, top→bottom)?
   - Focus traps: does focus get stuck in a component?
   - Focus visibility: is the focus indicator visible on each element?

**Output:**
```
Keyboard Navigation Audit: https://example.com

Tab Order (35 focusable elements):
  1. [link] "Home" — ✓ visible focus
  2. [link] "Dashboard" — ✓ visible focus
  3. [link] "Users" — ✓ visible focus
  4. [button] "Create New" — ✗ focus indicator not visible
  5. [input] "Search" — ✓ visible focus
  ...

Issues:
  ✗ 2 elements have no visible focus indicator
    - button "Create New" (.toolbar > button)
    - link "Settings" (.sidebar > a:last-child)
  ✗ 3 interactive elements are not reachable by Tab
    - button "Close" (modal close button — tabindex=-1?)
    - link "Help" (hidden but interactive)
    - select "Filter" (tabindex=-1)
  ✓ No focus traps detected
  ✓ Tab order follows visual layout
```

### 4. Accessibility Tree Export (`a11y tree`)

Dump the full accessibility tree for manual inspection or diff.

**Method:**
- Use `page.accessibility.snapshot({ interestingOnly: false })`
- Format as indented tree

**Output:**
```
WebArea "Dashboard — MyApp"
├── navigation "Main navigation"
│   ├── link "Home"
│   ├── link "Dashboard" [focused]
│   └── link "Users"
├── main
│   ├── heading "Dashboard" [level=1]
│   ├── region "Metrics"
│   │   ├── heading "Revenue" [level=2]
│   │   └── text "$12,345"
│   └── region "Recent Activity"
│       ├── heading "Activity" [level=2]
│       └── list
│           ├── listitem "User signed up"
│           └── listitem "Order placed"
└── contentinfo
    └── link "Privacy Policy"
```

JSON mode: output raw accessibility tree as JSON.

### 5. Heading Hierarchy (`a11y headings`)

```
Heading Hierarchy: https://example.com/dashboard

  H1: Dashboard
    H2: Revenue
    H2: Recent Activity
      H3: Today
      H3: This Week
    H2: Settings
      H4: Account ← ⚠ Skipped H3

Issues:
  ⚠ 1 heading level skip (H2 → H4 at "Account")
  ✓ Single H1 found
  ✓ 6 total headings
```

### Implementation

**File:** `src/commands/a11y.ts` — extend existing (add sub-command dispatch, ~100 lines)
**File:** `src/a11y-coverage.ts` (~250 lines)
**File:** `src/a11y-tab-order.ts` (~200 lines)
**File:** `src/a11y-remediation.ts` (~200 lines)

1. **Coverage** (`src/a11y-coverage.ts`):
   - Use `page.evaluate()` to analyze all interactive elements
   - Check for accessible names via `aria-label`, `aria-labelledby`, inner text, `title`, `alt`
   - Count landmarks via semantic HTML tags
   - Compute percentages

2. **Tab order** (`src/a11y-tab-order.ts`):
   - Use `page.keyboard.press('Tab')` in a loop
   - After each Tab: `page.evaluate(() => document.activeElement)` to get focused element
   - Check focus visibility: compare computed outline/border before and after focus
   - Detect unreachable elements: compare focusable elements list with actually-focused list

3. **Remediation** (`src/a11y-remediation.ts`):
   - For each axe-core violation type, maintain a fix template
   - Include the actual element HTML and suggested fixed HTML
   - Common fixes: add `aria-label`, add `alt`, add `<label>`, fix heading level

4. **Tree export**:
   - `page.accessibility.snapshot()` already returns tree structure
   - Format with indentation and Unicode box-drawing characters

5. **Headings**:
   - `page.evaluate()` to get all h1-h6 elements with their levels and text
   - Check for single H1, no level skips, logical hierarchy

## Testing

**File:** `test/a11y-coverage.test.ts`
- Test coverage calculation with mock page
- Test landmark detection
- Test accessible name resolution

**File:** `test/a11y-tab-order.test.ts`
- Test tab sequence recording
- Test skip detection
- Test focus visibility check

**File:** `test/a11y-remediation.test.ts`
- Test fix suggestion generation for common violations
- Test HTML snippet formatting

## Dependencies

- No new dependencies — uses existing axe-core integration and Playwright accessibility APIs

## Estimated Scope

- `src/a11y-coverage.ts` — ~250 lines
- `src/a11y-tab-order.ts` — ~200 lines
- `src/a11y-remediation.ts` — ~200 lines
- Extensions to `src/commands/a11y.ts` — ~100 lines
- Tests — ~400 lines total
- Help text updates — ~60 lines
