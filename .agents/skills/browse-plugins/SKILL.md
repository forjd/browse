---
name: browse-plugins
description: "Create plugins for the browse CLI. Use when the user wants to extend browse with custom commands, add lifecycle hooks, or build a browse plugin. Triggers include: 'create a plugin', 'add a command to browse', 'extend browse', 'browse plugin', 'hook into browse'."
---

# Browse Plugin Authoring

## What a plugin is

A plugin is a TypeScript or JavaScript file that default-exports a `BrowsePlugin` object. It can add custom commands, custom flow reporters, and hook into the lifecycle of any browse command.

## Plugin structure

```typescript
import type { BrowsePlugin } from "browse/plugin";
// In this repo, use: import type { BrowsePlugin } from "../src/plugin.ts";

const plugin: BrowsePlugin = {
  name: "my-plugin",
  version: "1.0.0",
  commands: [/* PluginCommand[] */],
  reporters: [/* CustomReporter[] */],
  hooks: {/* PluginHooks */},
};

export default plugin;
```

## Type definitions

All types are in `src/plugin.ts`. The key types:

### CommandContext

Passed to every command handler:

```typescript
type CommandContext = {
  page: Page;                              // Active Playwright page
  context: BrowserContext;                 // Session's browser context
  config: BrowseConfig | null;            // Loaded browse config
  args: string[];                         // Command arguments
  sessionState: Record<string, unknown>;  // Per-plugin, per-session state
  request: { session?: string; json?: boolean; timeout?: number };
};
```

### PluginCommand

```typescript
type PluginCommand = {
  name: string;            // Must not collide with built-in commands
  summary: string;         // One-line for `browse help`
  usage: string;           // Full usage for `browse help <command>`
  flags?: string[];        // Known flags for validation
  timeoutExempt?: boolean; // Exempt from --timeout
  handler: (ctx: CommandContext) => Promise<Response>;
};
```

### PluginHooks

```typescript
type PluginHooks = {
  init?: (config: BrowseConfig | null) => Promise<void>;
  beforeCommand?: (cmd: string, ctx: CommandContext) => Promise<Response | void>;
  afterCommand?: (cmd: string, ctx: CommandContext, response: Response) => Promise<void>;
  cleanup?: () => Promise<void>;
};
```

### CustomReporter

```typescript
type CustomReporter = {
  name: string;
  render: (ctx: {
    flowName: string;
    results: StepResult[];
    durationMs: number;
  }) => string;
};
```

Custom reporters become available through `browse flow --reporter <name>` and `browse test-matrix --reporter <name>`.

### Response

```typescript
type Response = { ok: true; data: string } | { ok: false; error: string };
```

## Step-by-step: creating a plugin

1. **Create the file** — e.g. `plugins/my-plugin.ts`

2. **Define at least one command or hook:**

```typescript
import type { BrowsePlugin } from "../src/plugin.ts";

const plugin: BrowsePlugin = {
  name: "my-plugin",
  version: "1.0.0",
  commands: [
    {
      name: "my-cmd",
      summary: "Does something useful",
      usage: `browse my-cmd [--json]

Flags:
  --json   Output as JSON`,
      flags: ["--json"],
      handler: async (ctx) => {
        const url = ctx.page.url();
        if (ctx.request.json) {
          return { ok: true, data: JSON.stringify({ url }) };
        }
        return { ok: true, data: `Current page: ${url}` };
      },
    },
  ],
};

export default plugin;
```

3. **Register in `browse.config.json`:**

```json
{
  "environments": {},
  "plugins": ["./plugins/my-plugin.ts"]
}
```

4. **Test it:**

```bash
browse my-cmd
browse my-cmd --json
browse help my-cmd
```

## Registration

Plugins are discovered from two sources:

- **Config file** — `"plugins"` array in `browse.config.json`. Relative paths resolve from the config file's directory. Bare names (e.g. `"browse-plugin-foo"`) resolve as npm packages.
- **Global directory** — `~/.browse/plugins/` — any `.ts` or `.js` files are auto-loaded.

## Key behaviours

- **Command names must be unique** — collisions with built-in commands or other plugins are rejected at load time with a warning.
- **Reporter names must be unique** — collisions with built-in reporters or other plugin reporters are rejected at load time with a warning.
- **Errors are isolated** — a throwing handler returns `{ ok: false, error }`, never crashes the daemon. Hook errors are caught similarly.
- **`sessionState` persists per session** — use it to track state across commands. It resets when the session is closed.
- **`beforeCommand` can short-circuit** — return a `Response` to prevent the command from running.
- **`afterCommand` is read-only** — observe the response but cannot mutate it.
- **`init` failures are non-fatal** — the plugin's commands and hooks still register.

## Example plugins

See `examples/plugin-example.ts` for a working example with a command and lifecycle hooks.

Browse also ships official starter plugins under `examples/plugins/`:

- `examples/plugins/slack/index.ts`
- `examples/plugins/discord/index.ts`
- `examples/plugins/jira/index.ts`

Use them as references when building integrations around webhooks or external issue trackers.

## Full documentation

See `docs/plugins.md` for the complete guide including publishing plugins as npm packages.
