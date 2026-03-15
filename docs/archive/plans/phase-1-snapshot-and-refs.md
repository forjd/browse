# Phase 1 — Snapshot and Ref System

**Goal:** The agent can see page structure and target elements by ref, enabling form-filling and interaction without CSS selectors.

**Prerequisite:** Phase 0 (daemon + CLI + basic navigation) — see `phase-0-foundation.md`.

---

## File Structure (additions to Phase 0)

```
src/
  commands/
    snapshot.ts     # Accessibility tree snapshot with ref assignment
    click.ts        # Click element by ref
    fill.ts         # Clear + type into input by ref
    select.ts       # Select dropdown option by ref
  refs.ts           # Ref registry — assignment, storage, resolution, staleness
```

---

## Protocol Changes

### Request

Extend the command union from Phase 0:

```ts
type Request = {
  cmd: "goto" | "text" | "quit" | "snapshot" | "click" | "fill" | "select";
  args: string[];
};
```

### Flag parsing

Phase 0 uses positional args only. Phase 1 introduces flags for `snapshot` (`-i`, `-f`). Rather than adding a flag-parsing library, handle these as simple string checks on `args`:

```
browse snapshot        → args: []
browse snapshot -i     → args: ["-i"]
browse snapshot -f     → args: ["-f"]
```

No general-purpose flag parser — just pattern-match the known flags per command.

---

## Ref System (`refs.ts`)

The ref system maps short identifiers (`@e1`, `@e2`, ...) to Playwright locators, allowing the agent to target elements without knowing CSS selectors or XPaths.

### Ref registry

A daemon-side module that holds the current ref map:

```ts
type RefEntry = {
  ref: string;              // "@e1", "@e2", etc.
  role: string;             // Accessibility role: "link", "button", "textbox", etc.
  name: string;             // Accessible name (visible text, aria-label, etc.)
  locator: Locator;         // Playwright Locator for this element
};

let currentRefs: Map<string, RefEntry> = new Map();
let refsGeneration: number = 0;  // Incremented on each snapshot
```

### Ref assignment

1. Call `page.accessibility.snapshot()` to get the accessibility tree.
2. Walk the tree depth-first.
3. For each node, determine if it should receive a ref (based on snapshot mode — see below).
4. Assign refs sequentially: `@e1`, `@e2`, `@e3`, ...
5. Build a Playwright locator for each ref'd node using `page.getByRole(role, { name })`.
6. Store in `currentRefs`, increment `refsGeneration`.

### Ref resolution

```ts
function resolveRef(ref: string): RefEntry | { error: string }
```

- If `ref` is not in `currentRefs`, return `{ error: "Unknown ref: @e7. Run 'browse snapshot' to see available refs." }`.
- Refs are always valid until the next `snapshot` call or a navigation event (see staleness below).

### Staleness

Refs become stale when the page changes underneath them. Two triggers:

1. **Explicit:** Every `snapshot` call regenerates all refs. Old refs are gone.
2. **Implicit:** After `goto` navigation, clear all refs and set a `stale` flag. Any interaction command (`click`, `fill`, `select`) against a stale registry returns: `"Refs are stale after navigation. Run 'browse snapshot' to refresh."`.

Implementation: listen to `page.on("framenavigated")` on the main frame to detect navigation and clear refs.

### Locator strategy

The accessibility tree provides `role` and `name` for each node. Map these to Playwright's role-based locators:

```ts
page.getByRole(role, { name, exact: true });
```

This is the most robust locator strategy — it matches what the user sees and survives DOM restructuring. If a role+name combination isn't unique on the page, fall back to combining with the node's hierarchical position (nth match).

**Handling duplicates:** If multiple elements share the same role+name, use `.nth(index)` to disambiguate. The snapshot output should indicate duplicates clearly (e.g., append ` (2 of 3)` to the display).

---

## Commands

### `snapshot`

Reads the accessibility tree and returns a compact text representation of the page.

**Modes:**

| Flag | Behaviour |
|------|-----------|
| _(none)_ | Interactive elements only: links, buttons, textboxes, comboboxes, checkboxes, radio buttons, sliders, spinbuttons, switches. This is the default — compact, low-token output. |
| `-i` | Interactive + structural elements: adds headings, paragraphs, lists, images (with alt text), table cells. Gives the agent fuller context without the noise of the full tree. |
| `-f` | Full tree dump. Every node in the accessibility tree. For debugging only. |

**Output format:**

```
[page] "Dashboard — MyApp"

@e1 [link] "Home"
@e2 [link] "Users"
@e3 [textbox] "Search..." (placeholder)
@e4 [button] "Create New"
@e5 [combobox] "Role"
  @e6 [option] "Admin"
  @e7 [option] "Editor"
  @e8 [option] "Viewer"
```

With `-i` flag, non-interactive structural elements appear without refs:

```
[page] "Dashboard — MyApp"

[heading, level=1] "Dashboard"
[paragraph] "Welcome back. You have 3 pending invitations."

@e1 [link] "Home"
@e2 [link] "Users"

[heading, level=2] "Search"
@e3 [textbox] "Search..." (placeholder)
@e4 [button] "Create New"
```

**Design notes:**

- Indent nested elements by 2 spaces per level to show hierarchy.
- Show the page title on the first line for orientation.
- Keep output under 10,000 characters by default. If the tree exceeds this, truncate with a `[... N more elements, use -f for full tree]` message. This prevents blowing out the agent's context window.
- Empty/unnamed elements are omitted from default and `-i` output.

**Implementation:**

1. Call `page.accessibility.snapshot({ interestingOnly: false })` to get the full tree (we filter ourselves for more control).
2. Walk depth-first, filtering nodes based on the mode.
3. Assign refs to interactive elements.
4. Format each node as `[@ref] [role] "name" (extras)`.
5. Return the formatted string.

### `click <ref>`

1. Validate `args[0]` is present and starts with `@`. If missing: return error with usage hint.
2. Resolve ref via `resolveRef()`. If stale/unknown: return the error message.
3. Call `locator.click({ timeout: 10_000 })`.
4. Return `{ ok: true, data: "Clicked @e4 [button] \"Create New\"" }`.

If the click triggers a navigation (detected via `page.waitForURL` race), note it in the response: `"Clicked @e4 [button] \"Submit\". Page navigated to /dashboard."` and mark refs as stale.

### `fill <ref> <value>`

1. Validate `args[0]` (ref) and `args[1]` (value) are present.
2. Resolve ref. Verify the element's role is an input type (`textbox`, `searchbox`, `spinbutton`, `combobox`). If not: return `"@e4 is a [button], not a fillable element."`.
3. Call `locator.fill(value, { timeout: 10_000 })`. Playwright's `fill` clears existing content first.
4. Return `{ ok: true, data: "Filled @e3 [textbox] \"Search...\" with \"test query\"" }`.

**Value from args:** The fill value is everything after the ref in args. `browse fill @e3 hello world` → value is `"hello world"`. Join `args.slice(1)` with spaces, or accept a quoted string.

### `select <ref> <option>`

1. Validate `args[0]` (ref) and `args[1]` (option text) are present.
2. Resolve ref. Verify the element's role is `combobox` or `listbox`. If not: return type mismatch error.
3. Call `locator.selectOption({ label: optionText }, { timeout: 10_000 })` to select by visible text.
4. Return `{ ok: true, data: "Selected \"Admin\" in @e5 [combobox] \"Role\"" }`.

---

## CLI Argument Parsing Updates

Phase 0's argument parsing is `[command, ...args]`. No changes to the structure — the new commands slot in naturally:

```
browse snapshot              → cmd: "snapshot", args: []
browse snapshot -i           → cmd: "snapshot", args: ["-i"]
browse click @e4             → cmd: "click",    args: ["@e4"]
browse fill @e3 hello world  → cmd: "fill",     args: ["@e3", "hello", "world"]
browse select @e5 Admin      → cmd: "select",   args: ["@e5", "Admin"]
```

---

## Testing Strategy

### Unit tests

- **Ref assignment:** Given a mock accessibility tree, verify refs are assigned in correct depth-first order, only to interactive elements in default mode, to interactive + structural in `-i` mode.
- **Ref resolution:** Valid ref returns entry, unknown ref returns error, stale refs return stale message.
- **Duplicate handling:** Two buttons with the same name get distinct refs and correct nth-match locators.
- **Output formatting:** Snapshot output matches expected text format, respects indentation, handles truncation.
- **Argument parsing:** `fill` correctly joins multi-word values, `click` rejects missing ref, `select` rejects non-combobox targets.

### Integration tests

- Start daemon, `goto` a test page, `snapshot`, verify output lists the correct interactive elements.
- `snapshot -i` includes headings and paragraphs.
- `click` a button, verify the expected action occurred (e.g., a counter incremented — check via `text`).
- `fill` an input, `snapshot` again, verify the input shows the new value.
- `goto` a new page, attempt `click @e1` without re-snapshotting, verify stale ref error.
- `snapshot` after navigation, verify new refs work.

### Test page

Create a minimal HTML test fixture (`test/fixtures/test-page.html`) served by a local HTTP server during tests. The page should contain:

- Links, buttons, text inputs, a select dropdown.
- A heading and paragraph (for `-i` mode testing).
- A button that triggers a client-side state change (for click verification).
- Duplicate-named elements (for disambiguation testing).

---

## Acceptance Criteria

1. `browse snapshot` returns a compact list of interactive elements with refs (`@e1`, `@e2`, ...).
2. `browse snapshot -i` includes structural elements (headings, paragraphs) without refs.
3. `browse snapshot -f` returns the full accessibility tree.
4. `browse click @eN` clicks the referenced element and confirms the action.
5. `browse fill @eN "value"` fills the referenced input and confirms.
6. `browse select @eN "option"` selects the option in the referenced dropdown and confirms.
7. Refs are regenerated on each `snapshot` call — old refs are invalidated.
8. Using a ref after `goto` navigation (without re-snapshotting) returns a clear stale-ref error.
9. Duplicate elements on the page are disambiguated and individually targetable.
10. Snapshot output stays under 10,000 characters with a truncation indicator when exceeded.
11. All interaction commands return human-readable confirmation messages (not raw JSON).

---

## Resolved Questions

1. **Locator strategy** — Use `page.getByRole(role, { name, exact: true })` as the primary locator. It's robust against DOM changes and aligns with what the accessibility tree provides. Fall back to `.nth(index)` for duplicates.
2. **Snapshot truncation** — Cap at 10,000 characters. The agent can use `-f` if it needs the full tree, but the default should be context-window-friendly.
3. **Ref format** — `@e1`, `@e2`, etc. Short, distinctive, unlikely to collide with page content. The `@` prefix makes them easy to grep in agent output.
4. **Staleness detection** — Listen to `framenavigated` events rather than requiring the agent to manually invalidate. Automatic staleness is safer.
5. **Fill value parsing** — Join remaining args with spaces. Quoted strings in the shell are already handled by the shell itself — `browse fill @e3 "hello world"` arrives as `args: ["@e3", "hello world"]`.
6. **Flag parsing** — No library. Simple string matching on known flags per command. A general-purpose parser is overkill until Phase 3+ introduces more complex flags.
