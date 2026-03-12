# Phase 3 — Auth and Multi-Tab

**Goal:** The agent can log into the application, persist auth state for reuse, and manage multiple tabs.

**Prerequisite:** Phase 2 (screenshot and console) — see `phase-2-screenshot-and-console.md`.

---

## File Structure (additions to Phase 2)

```
src/
  commands/
    auth-state.ts   # Save/load auth state (cookies + localStorage)
    login.ts        # Automated login via config-defined environments
    tab.ts          # Tab list, new, switch, close
  config.ts         # Config file loading and validation
```

---

## Protocol Changes

### Request

Extend the command union from Phase 2:

```ts
type Request = {
  cmd: "goto" | "text" | "quit" | "snapshot" | "click" | "fill" | "select"
     | "screenshot" | "console" | "network"
     | "auth-state" | "login" | "tab";
  args: string[];
};
```

### Subcommand pattern

Phase 3 introduces the first commands with subcommands: `auth-state save|load` and `tab list|new|switch|close`. These are parsed from `args[0]`:

```
browse auth-state save /tmp/auth.json  → cmd: "auth-state", args: ["save", "/tmp/auth.json"]
browse tab list                        → cmd: "tab",        args: ["list"]
browse tab switch 2                    → cmd: "tab",        args: ["switch", "2"]
```

The command handler dispatches on `args[0]` as the subcommand. Unknown subcommands return an error listing valid options.

---

## Auth State Command (`auth-state.ts`)

Exports and imports browser session state (cookies and localStorage) to/from a JSON file, enabling session reuse across daemon restarts.

### Usage

```
browse auth-state save /tmp/auth.json    → export session to file
browse auth-state load /tmp/auth.json    → restore session from file
```

### Implementation

Uses Playwright's built-in `browserContext.storageState()` and `browser.newContext({ storageState })` which handle cookies and localStorage natively.

**Save:**

```ts
const state = await context.storageState();
await Bun.write(path, JSON.stringify(state, null, 2));
```

Returns: `"Auth state saved to /tmp/auth.json (3 cookies, 2 localStorage entries)."`

Count cookies and localStorage entries from the state object for the confirmation message.

**Load:**

```ts
const state = JSON.parse(await Bun.file(path).text());
```

Loading state into a persistent context requires applying it manually:

1. **Cookies:** Call `context.addCookies(state.cookies)`.
2. **localStorage:** For each origin in `state.origins`, navigate to that origin and inject localStorage via `page.evaluate()`.
3. Reload the current page after loading state so the restored session takes effect.

Returns: `"Auth state loaded from /tmp/auth.json (3 cookies, 2 localStorage entries). Page reloaded."`

### Edge cases

- **Missing file on load:** Return `"File not found: /tmp/auth.json"`.
- **Invalid JSON on load:** Return `"Invalid auth state file: /tmp/auth.json (malformed JSON)"`.
- **Missing path argument:** Return error with usage hint.
- **Save to path with missing parent directory:** Create parent directories before writing, same as screenshot in Phase 2.

### Security note

Auth state files contain real session tokens. The CLI never logs the contents — only the file path and entry counts. The file is written with default permissions; users are responsible for securing it. This is documented but not enforced by the tool.

---

## Login Command (`login.ts`)

A convenience command that automates the login flow for a configured environment. Replaces the manual sequence of `goto` → `snapshot` → `fill` → `click` → wait, saving the agent several commands and tokens.

### Usage

```
browse login --env staging
browse login --env production
```

### Configuration

Login environments are defined in `browse.config.json` (see Config section below). Each environment specifies:

- The login page URL.
- Which environment variable holds the username and password.
- A success condition to verify login worked.

### Flow

1. Read the environment config from `browse.config.json`.
2. Read credentials from the environment variables named in the config.
3. Navigate to the login URL.
4. Wait for the page to load (`domcontentloaded`).
5. Snapshot the page to find form elements.
6. Fill the username field (matched by role `textbox` with the configured name/label).
7. Fill the password field (matched by role `textbox` with type `password`, or by configured name/label).
8. Click the submit button (matched by role `button` with the configured name/label).
9. Wait for the success condition (URL change, element appears, or specific text on page).
10. Return a confirmation message with the final URL.

Returns: `"Logged in to staging. Current page: https://staging.example.com/dashboard"`

### Error handling

- **Missing config file:** `"No browse.config.json found. Create one with login environments or use goto + fill + click manually."`.
- **Unknown environment:** `"Unknown environment: 'staging'. Available: production, development."`.
- **Missing environment variables:** `"Missing credentials. Set BROWSE_STAGING_USER and BROWSE_STAGING_PASS environment variables."`.
- **Login failed (success condition not met within timeout):** `"Login may have failed. Expected URL to contain '/dashboard' but current URL is '/login?error=invalid'. Screenshot saved to <path>."` — auto-capture a screenshot on failure for debugging.

### Login failure screenshot

On login failure, automatically take a screenshot and include the path in the error message. This gives the agent immediate visual feedback without needing a separate `screenshot` command.

---

## Config File (`config.ts`)

### File location

The daemon looks for `browse.config.json` in the current working directory at daemon startup. If not found, config-dependent commands (`login`) return a clear error. Non-config commands work fine without it.

### Schema (Phase 3 scope)

```ts
type BrowseConfig = {
  environments: Record<string, EnvironmentConfig>;
};

type EnvironmentConfig = {
  loginUrl: string;                  // e.g. "https://staging.example.com/login"
  userEnvVar: string;                // e.g. "BROWSE_STAGING_USER"
  passEnvVar: string;                // e.g. "BROWSE_STAGING_PASS"
  usernameField?: string;            // Accessible name of username input (default: "Username" or "Email")
  passwordField?: string;            // Accessible name of password input (default: "Password")
  submitButton?: string;             // Accessible name of submit button (default: "Sign in" or "Log in")
  successCondition: SuccessCondition;
};

type SuccessCondition =
  | { urlContains: string }          // e.g. { urlContains: "/dashboard" }
  | { urlPattern: string }           // e.g. { urlPattern: "^https://.*/(dashboard|home)" }
  | { elementVisible: string };      // CSS selector, e.g. { elementVisible: ".user-avatar" }
```

### Example config

```json
{
  "environments": {
    "staging": {
      "loginUrl": "https://staging.example.com/login",
      "userEnvVar": "BROWSE_STAGING_USER",
      "passEnvVar": "BROWSE_STAGING_PASS",
      "submitButton": "Sign in",
      "successCondition": { "urlContains": "/dashboard" }
    },
    "production": {
      "loginUrl": "https://app.example.com/login",
      "userEnvVar": "BROWSE_PROD_USER",
      "passEnvVar": "BROWSE_PROD_PASS",
      "successCondition": { "elementVisible": ".user-menu" }
    }
  }
}
```

### Config validation

On load, validate the config shape and report specific errors:

- Missing required fields: `"Invalid browse.config.json: environment 'staging' is missing 'loginUrl'."`.
- Invalid JSON: `"Failed to parse browse.config.json: Unexpected token at position 42."`.

Config is loaded once at daemon startup and cached. No hot-reloading — restart the daemon to pick up changes.

### Phase 4 extension point

Phase 4 adds `flows` and `assertions` to this same config file. The Phase 3 schema is a subset that Phase 4 extends. No breaking changes needed.

---

## Tab Management (`tab.ts`)

Manages multiple browser tabs (Playwright pages within the same browser context). All existing commands operate on the active tab.

### Usage

```
browse tab list              → show open tabs with indices
browse tab new <url>         → open URL in new tab, switch to it
browse tab new               → open blank tab, switch to it
browse tab switch <index>    → switch to tab by index (1-based)
browse tab close <index>     → close tab by index (1-based)
browse tab close             → close the active tab
```

### Tab indexing

Tabs are **1-based** in all user-facing output. Tab 1 is the first tab. This matches the intuitive mental model ("switch to tab 2" means the second tab).

### Tab registry

The daemon maintains an ordered list of open pages:

```ts
let tabs: Page[] = [];       // Ordered list of Playwright Page objects
let activeTabIndex: number = 0;  // 0-based internally, 1-based externally
```

On daemon startup, the initial page is `tabs[0]`.

### `tab list`

Returns a numbered list of open tabs with their URLs and titles. The active tab is marked:

```
  1. [active] "Dashboard — MyApp" (https://staging.example.com/dashboard)
  2. "Users — MyApp" (https://staging.example.com/users)
  3. "Settings — MyApp" (https://staging.example.com/settings)
```

### `tab new [url]`

1. Create a new page in the browser context: `const page = await context.newPage()`.
2. Attach console and network listeners to the new page (see Listener Lifecycle below).
3. Add to `tabs` array.
4. Set as active tab.
5. If a URL is provided, navigate to it (`page.goto(url)`).
6. Return: `"Opened tab 3: https://staging.example.com/settings"` or `"Opened tab 3 (blank)"`.

### `tab switch <index>`

1. Validate the index is a number within range. If not: `"Invalid tab index: 5. Open tabs: 1–3."`.
2. Set `activeTabIndex` to the new index.
3. Bring the page to front: `page.bringToFront()`.
4. Clear refs (staleness — consistent with navigation behaviour from Phase 1).
5. Return: `"Switched to tab 2: \"Users — MyApp\" (https://staging.example.com/users)"`.

### `tab close [index]`

1. If no index provided, close the active tab.
2. If index provided, validate it's in range.
3. **Cannot close the last remaining tab.** If only one tab is open: `"Cannot close the only open tab. Use 'browse quit' to stop the daemon."`.
4. Close the page: `await page.close()`.
5. Remove from `tabs` array.
6. If the closed tab was active, switch to the nearest tab (prefer the previous tab; if closing tab 1, switch to the new tab 1).
7. Clear refs.
8. Return: `"Closed tab 2. Active tab is now 1: \"Dashboard — MyApp\""`.

### Active tab and existing commands

All existing commands (`goto`, `text`, `snapshot`, `click`, `fill`, `select`, `screenshot`, `console`, `network`) operate on the active tab's page. No changes to these commands — they already reference a `page` variable, which now points to `tabs[activeTabIndex]`.

Implementation: replace the single `page` variable with a `getActivePage()` function that returns `tabs[activeTabIndex]`. All command handlers call this instead of referencing `page` directly.

---

## Per-Tab Buffers

Console and network buffers from Phase 2 become per-tab. Each tab has its own independent console and network ring buffer.

### Implementation

```ts
type TabState = {
  page: Page;
  consoleBuffer: RingBuffer<ConsoleEntry>;
  networkBuffer: RingBuffer<NetworkEntry>;
};

let tabs: TabState[] = [];
```

When `browse console` or `browse network` is called, it reads from the active tab's buffer. This ensures the agent only sees messages relevant to the tab it's working on.

### Listener attachment

When a new tab is created (`tab new` or the initial page on daemon startup):

1. Create new `RingBuffer` instances for console and network.
2. Attach `page.on("console", ...)` and `page.on("response", ...)` listeners that push to the tab's buffers.

When a tab is closed, its buffers are discarded.

---

## Ref Behaviour on Tab Switch

Refs are cleared when switching tabs, consistent with the Phase 1 staleness model for navigation. The agent must `snapshot` after switching tabs before interacting with elements.

Attempting to use a ref after switching tabs returns: `"Refs are stale after tab switch. Run 'browse snapshot' to refresh."`.

Implementation: the existing `framenavigated` staleness mechanism from Phase 1 doesn't fire on tab switch. Add an explicit `clearRefs()` call in `tab switch` and `tab close` (when the active tab changes).

---

## CLI Argument Parsing Updates

The new commands follow the established positional pattern with subcommands:

```
browse auth-state save /tmp/auth.json     → cmd: "auth-state", args: ["save", "/tmp/auth.json"]
browse auth-state load /tmp/auth.json     → cmd: "auth-state", args: ["load", "/tmp/auth.json"]
browse login --env staging                → cmd: "login",      args: ["--env", "staging"]
browse tab list                           → cmd: "tab",        args: ["list"]
browse tab new https://example.com        → cmd: "tab",        args: ["new", "https://example.com"]
browse tab switch 2                       → cmd: "tab",        args: ["switch", "2"]
browse tab close 2                        → cmd: "tab",        args: ["close", "2"]
```

Same simple string matching approach — no flag parser library.

---

## Testing Strategy

### Unit tests

- **Config loading:** Valid config parses correctly. Missing fields produce specific error messages. Invalid JSON reports parse error. Missing file returns null (not an error).
- **Config validation:** Each `EnvironmentConfig` field is validated. Missing `loginUrl`, missing env var names, invalid `successCondition` shape — all produce clear messages.
- **Tab registry:** Adding tabs increments count. Closing the last tab is rejected. Closing a tab updates the active index correctly. Index validation catches out-of-range values.
- **Auth state serialisation:** Save writes valid JSON with cookies and origins. Load parses and applies correctly. Malformed file produces clear error.

### Integration tests

Spin up a local test server extending the Phase 2 fixture. The test server should:

- Serve a login page with username/password fields and a submit button.
- Accept a known credential pair and redirect to a dashboard page on success.
- Return to the login page with an error on failure.
- Set a session cookie on successful login.

**Auth state tests:**

- Log in manually (`goto` → `fill` → `click`), `auth-state save /tmp/test-auth.json`, verify file exists and contains cookies.
- Restart daemon, `auth-state load /tmp/test-auth.json`, navigate to a protected page, verify access is granted (session cookie is present).
- `auth-state load /tmp/nonexistent.json` → verify clear error message.

**Login tests:**

- Create a `browse.config.json` with the test server's login config. Set credential env vars. `login --env test` → verify successful login and confirmation message.
- Unset credential env vars → `login --env test` → verify missing credentials error.
- `login --env nonexistent` → verify unknown environment error.
- Configure with wrong success condition → verify login failure error includes a screenshot path.

**Tab tests:**

- `tab list` → verify single tab listed, marked active.
- `tab new https://example.com` → `tab list` → verify two tabs, second is active.
- `tab switch 1` → verify switched back to first tab. `snapshot` → verify refs are from tab 1's page.
- `tab close 2` → `tab list` → verify single tab remaining.
- Attempt `tab close` with one tab open → verify rejection error.
- Open two tabs → `goto` on tab 2 → `console` → verify only tab 2's console messages appear. `tab switch 1` → `console` → verify only tab 1's messages.

**Ref staleness on tab switch:**

- `goto` test page → `snapshot` → note a ref → `tab new` → attempt `click @e1` → verify stale ref error.
- `tab switch 1` → attempt `click @e1` → verify stale ref error (switching back also clears refs).

### Test fixtures

Extend `test/fixtures/` with:

- `login.html` — login form with username, password, and submit button.
- Test server login endpoint that validates credentials and sets a session cookie.
- `protected.html` — page that checks for the session cookie and returns different content based on auth status.
- `browse.config.json` — test config pointing at the test server.

---

## Acceptance Criteria

1. `browse auth-state save <path>` exports cookies and localStorage to a JSON file.
2. `browse auth-state load <path>` restores session state from a file and reloads the page.
3. Auth state files are compatible across daemon restarts.
4. `browse login --env <name>` automates the full login flow using config-defined environments.
5. Login reads credentials from environment variables, never from the config file directly.
6. Login failure produces an error message with an auto-captured screenshot path.
7. `browse tab list` shows all open tabs with indices, URLs, titles, and active marker.
8. `browse tab new [url]` opens a new tab, optionally navigates to a URL, and switches to it.
9. `browse tab switch <index>` switches the active tab (1-based indexing).
10. `browse tab close [index]` closes a tab and switches to the nearest remaining tab.
11. Closing the last remaining tab is rejected with a clear error message.
12. All existing commands (goto, text, snapshot, click, fill, select, screenshot, console, network) operate on the active tab.
13. Console and network buffers are per-tab — switching tabs shows only that tab's messages.
14. Refs are cleared on tab switch. Using a stale ref after switching returns a clear error.
15. `browse.config.json` is validated on daemon startup with specific error messages for invalid config.

---

## Resolved Questions

1. **Auth state mechanism** — Use Playwright's native `storageState()` for export. For import into a persistent context, apply cookies via `context.addCookies()` and localStorage via `page.evaluate()` per origin, then reload. This avoids needing to recreate the browser context.
2. **Config file introduction** — Introduce `browse.config.json` in Phase 3 scoped to auth environments only. Phase 4 extends the same file with flows and assertions. No breaking changes needed.
3. **Tab indexing** — 1-based in all user-facing output. Internal storage is 0-based (standard array indexing). Conversion happens at the command boundary.
4. **Per-tab vs global buffers** — Per-tab. Console and network buffers are scoped to each tab so the agent only sees messages relevant to the tab it's working on. Listeners are attached on tab creation and buffers are discarded on tab close.
5. **Ref staleness on tab switch** — Refs are cleared on tab switch, consistent with the navigation staleness model from Phase 1. Explicit `clearRefs()` call in `tab switch` and `tab close`.
6. **Config hot-reloading** — Not supported. Config is loaded once at daemon startup. Restart the daemon to pick up changes. Hot-reloading adds complexity for minimal benefit.
7. **Login field matching** — The login command uses accessible names to find form fields (via the ref system's locator strategy). Configurable field names in the config allow matching non-standard forms. Defaults (`"Username"`, `"Email"`, `"Password"`, `"Sign in"`, `"Log in"`) cover common patterns.
