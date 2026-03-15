# Getting Started

`browse` is a fast CLI for browser automation that wraps Playwright behind a persistent daemon on a Unix socket. The daemon cold-starts in ~3 seconds on first use; after that, every command runs in sub-200 ms.

## Prerequisites

- [Bun](https://bun.sh) >= 1.0

## Installation

### Quick install

```bash
curl -fsSL https://raw.githubusercontent.com/forjd/browse/main/install.sh | bash
```

### Manual install

```bash
git clone https://github.com/forjd/browse.git
cd browse
./setup.sh
```

`setup.sh` installs dependencies, downloads Chromium, compiles a standalone binary to `dist/browse`, and symlinks it to `~/.local/bin/browse`. Make sure `~/.local/bin` is on your `PATH`.

## Claude Code skill

To register `browse` as a Claude Code skill:

```bash
bunx skills add forjd/browse
```

Claude Code will then automatically use `browse` for browser-related tasks.

## First run

### 1. Navigate to a page

```bash
browse goto https://example.com
```

The daemon starts automatically on the first command — no separate setup step needed.

### 2. Observe the page

```bash
browse snapshot
```

This prints a structured view of the page's interactive elements, each labelled with a **ref** (`@e1`, `@e2`, …). Refs are how you target elements in subsequent commands.

### 3. Interact

```bash
browse click @e1
browse fill @e2 "search query"
```

Use refs from the most recent snapshot. Refs are ephemeral — they regenerate on every `snapshot` call and go stale after navigation.

### 4. Capture a screenshot

```bash
browse screenshot
```

### 5. Shut down

```bash
browse quit
```

This stops the daemon and closes the browser.

## The core loop

Every browser task follows the same pattern:

```
Navigate → Observe → Interact → Verify
```

1. **Navigate** — `browse goto <url>`
2. **Observe** — `browse snapshot` to see interactive elements and their refs
3. **Interact** — `browse click`, `browse fill`, `browse press`, etc.
4. **Verify** — `browse snapshot` or `browse screenshot` to confirm the result

Always re-snapshot after any action that changes the page. Stale refs produce a clear error — just snapshot again.

## Global flags

| Flag | Description |
|------|-------------|
| `--timeout <ms>` | Override the default timeout for a command |
| `--session <name>` | Route the command to a named session |
| `--json` | Return output as JSON |
| `--config <path>` | Path to `browse.config.json` (default: search upward from cwd, then `~/.browse/config.json`) |

## Environment variables

| Variable | Description |
|----------|-------------|
| `BROWSE_HEADED=1` | Launch browser in headed (visible) mode for debugging |

## Getting help

```bash
browse help                # list all commands
browse help <command>      # detailed usage for a specific command
browse <command> --help    # same as above
```

## Next steps

- [Commands Reference](commands.md) — full list of every command and its flags
- [The Ref System](refs.md) — how refs work and best practices
- [Sessions and Tabs](sessions-and-tabs.md) — isolated contexts and multi-tab workflows
- [Configuration](configuration.md) — daemon settings, timeouts, and defaults
- [Architecture](architecture.md) — how the daemon, socket, and browser pool fit together
