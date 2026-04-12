# Plugins

Browse has a plugin system that lets you add custom commands and hook into the command lifecycle. Plugins are TypeScript or JavaScript files that export a `BrowsePlugin` object.

## Quick start

1. Create a plugin file:

```typescript
// plugins/hello.ts
import type { BrowsePlugin } from "browse/plugin";

const plugin: BrowsePlugin = {
  name: "hello",
  version: "1.0.0",
  commands: [
    {
      name: "hello",
      summary: "Say hello",
      usage: "browse hello [name]",
      handler: async (ctx) => {
        const name = ctx.args[0] ?? "world";
        return { ok: true, data: `Hello, ${name}!` };
      },
    },
  ],
};

export default plugin;
```

2. Register it in `browse.config.json`:

```json
{
  "environments": {},
  "plugins": ["./plugins/hello.ts"]
}
```

3. Use it:

```bash
browse hello Dan
# Hello, Dan!
```

## Plugin definition

A plugin default-exports a `BrowsePlugin` object:

```typescript
type BrowsePlugin = {
  name: string;        // Unique plugin name
  version: string;     // Semver version
  commands?: PluginCommand[];
  hooks?: PluginHooks;
};
```

### Commands

Each command defines a name, help text, and an async handler:

```typescript
type PluginCommand = {
  name: string;           // Must not collide with built-in or other plugin commands
  summary: string;        // One-line description for `browse help`
  usage: string;          // Full usage text for `browse help <command>`
  flags?: string[];       // Known flags for validation (e.g. ["--json", "--verbose"])
  timeoutExempt?: boolean; // If true, exempt from global --timeout
  handler: (ctx: CommandContext) => Promise<Response>;
};
```

### CommandContext

Every handler receives a context bag with everything it needs:

```typescript
type CommandContext = {
  page: Page;                              // Active Playwright page
  context: BrowserContext;                 // Session's browser context
  config: BrowseConfig | null;            // Loaded browse config
  args: string[];                         // Command arguments
  sessionState: Record<string, unknown>;  // Per-plugin, per-session state
  request: {
    session?: string;
    json?: boolean;
    timeout?: number;
  };
};
```

**`sessionState`** persists across commands within a session and is scoped per plugin. Use it to track state between commands without managing your own maps.

### Response

Handlers return the standard browse response:

```typescript
type Response =
  | { ok: true; data: string }
  | { ok: false; error: string };
```

### Hooks

Plugins can hook into the lifecycle of any command (built-in or plugin):

```typescript
type PluginHooks = {
  init?: (config: BrowseConfig | null) => Promise<void>;
  beforeCommand?: (cmd: string, ctx: CommandContext) => Promise<Response | void>;
  afterCommand?: (cmd: string, ctx: CommandContext, response: Response) => Promise<void>;
  cleanup?: () => Promise<void>;
};
```

| Hook | When | Use case |
|------|------|----------|
| `init` | Daemon startup, after plugin is loaded | Set up resources, validate config |
| `beforeCommand` | Before any command executes | Auth gating, logging, rate limiting. Return a `Response` to short-circuit |
| `afterCommand` | After any command executes | Logging, metrics, telemetry |
| `cleanup` | Daemon shutdown | Release resources, flush buffers |

## Discovery

Plugins are discovered from two sources:

### 1. Config file

List plugin paths in `browse.config.json`:

```json
{
  "plugins": [
    "./plugins/my-plugin.ts",        
    "/absolute/path/plugin.ts",       
    "browse-plugin-lighthouse"        
  ]
}
```

- **Relative paths** resolve from the config file's directory
- **Absolute paths** are used as-is
- **Bare names** are resolved as npm packages via `import()`

### 2. Global plugins directory

Any `.ts` or `.js` files in `~/.browse/plugins/` are automatically loaded. This is useful for personal plugins that apply across all projects.

Config-declared plugins take precedence on name collision.

### 3. Marketplace discovery

Browse can also help you discover published plugins before you install them:

```bash
browse plugins official
browse plugins search slack
browse plugins search jira --limit 10
```

- `browse plugins official` lists first-party plugin packages
- `browse plugins search <query>` searches npm for packages tagged with the `browse-plugin` keyword
- Add the global `--json` flag for machine-readable output

## Error handling

The plugin system is designed to be resilient:

- **Load failures are non-fatal** — a bad plugin is skipped with a warning, other plugins and the daemon still work
- **Command handlers are wrapped in try/catch** — a throwing handler returns `{ ok: false, error: "Plugin 'name' error: ..." }` instead of crashing the daemon
- **Hook errors are isolated** — a throwing `beforeCommand` hook produces an error response; a throwing `afterCommand` or `cleanup` hook is silently ignored
- **Init failures don't prevent registration** — if `init` throws, the plugin's commands and hooks are still registered
- **Name collisions are rejected** — a plugin command that collides with a built-in command or another plugin is skipped with a warning

## Flag validation

If your command defines `flags`, browse validates them before your handler runs. Unknown flags produce a helpful error:

```typescript
{
  name: "audit",
  flags: ["--json", "--verbose", "--threshold"],
  handler: async (ctx) => { /* ... */ },
}
```

```bash
browse audit --unknown-flag
# Error: Unknown flag '--unknown-flag' for command 'audit'.
```

Commands without `flags` skip validation (useful for commands that accept freeform arguments).

## Timeout

Plugin commands go through the same timeout system as built-in commands (default 30s, configurable via `--timeout`). Set `timeoutExempt: true` for long-running commands like crawlers or report generators.

## Publishing plugins

For npm distribution, create a package with a default export:

```
browse-plugin-foo/
  index.ts    # exports default BrowsePlugin
  package.json
```

Users install and reference it by package name:

```bash
npm install browse-plugin-foo
```

```json
{
  "plugins": ["browse-plugin-foo"]
}
```

For type safety during development, install `browse` as a dev dependency and import the types:

```typescript
import type { BrowsePlugin, CommandContext } from "browse/plugin";
```
