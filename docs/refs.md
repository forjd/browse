# Refs

Refs are the primary way to target elements when using `browse` commands. They remove the need to write CSS selectors for most interactions.

## What Are Refs?

- Short identifiers (`@e1`, `@e2`, ...) that target interactive elements on the page
- Replace CSS selectors for most interactions (`click`, `fill`, `select`, `hover`, `upload`, `attr`, `scroll`)
- Created by running `browse snapshot`

## How Refs Are Assigned

1. `browse snapshot` calls Playwright's `page.locator("body").ariaSnapshot()` to get the ARIA accessibility tree
2. The YAML-like output is parsed into `AccessibilityNode` objects by `parseAriaSnapshot()`
3. `assignRefs()` walks the tree depth-first, assigning refs only to interactive elements that have a name
4. Refs are numbered sequentially: `@e1`, `@e2`, `@e3`, ...

## Interactive Roles (get refs)

`link`, `button`, `textbox`, `searchbox`, `combobox`, `listbox`, `checkbox`, `radio`, `slider`, `spinbutton`, `switch`, `menuitem`, `option`, `tab`

## Structural Roles (visible in `-i` and `-f` modes)

`heading`, `paragraph`, `list`, `listitem`, `img`, `image`, `table`, `cell`, `row`, `columnheader`, `rowheader`, `text`

## Snapshot Modes

- **Default** (`browse snapshot`): only interactive elements shown
- **Inclusive** (`browse snapshot -i`): interactive + structural elements with names
- **Full** (`browse snapshot -f`): all nodes in the tree

## Staleness

- Refs become stale after navigation (`goto`, `click` that triggers a page change)
- Staleness is tracked via the `framenavigated` event on the main frame
- Stale refs produce a clear error: `"Refs are stale after navigation. Run 'browse snapshot' to refresh."`
- Unknown refs produce: `"Unknown ref: @eN. Run 'browse snapshot' to see available refs."`
- Resolution: just run `browse snapshot` again

## Duplicate Handling

- Multiple elements with the same role + accessible name get separate refs
- Tracked via a `nthMatch` counter
- When resolved, uses `page.getByRole(role, {name, exact: true}).nth(nthMatch)` for duplicates
- Single matches use `page.getByRole(role, {name, exact: true})` without `.nth()`

## How Refs Resolve to Locators

`resolveLocator()` handles both refs and CSS selectors:

- If the string starts with `@`: resolves via the ref registry, producing a `page.getByRole()` locator
- Otherwise: treated as a CSS selector via `page.locator()`

This means commands like `wait visible`, `assert visible`, `html`, and `element-count` accept both `@eN` refs and CSS selectors.

## The Core Loop

```
browse snapshot              # see what's on the page — assigns @e1, @e2, ...
browse fill @e3 "test"       # interact using refs
browse click @e4             # click using refs
browse snapshot              # re-snapshot after page changes
```

## Tips

- Always snapshot before your first interaction on a page
- Re-snapshot after any navigation or significant DOM change
- Use `browse snapshot -i` to see headings and structure (helps orient yourself)
- Use `browse snapshot -f` for debugging — shows the full accessibility tree
- Refs are ephemeral — every snapshot regenerates them, old refs become invalid
- `--json` flag returns structured JSON output from snapshot

## Module-Level State

Refs are stored as module-level state (not per-session). This means refs are meaningful for one page at a time. If using sessions, the snapshot applies to whichever session's page you are working with.

## See Also

- [Commands Reference](commands.md)
- [Sessions and Tabs](sessions-and-tabs.md)
