# Discord Plugin Starter

Loads a `discord-notify` command that sends a message to a Discord webhook.

## Setup

1. Add the plugin to `browse.config.json`:

```json
{
  "plugins": ["./examples/plugins/discord/index.ts"]
}
```

2. Set `BROWSE_DISCORD_WEBHOOK_URL` to your Discord webhook URL.

## Usage

```bash
browse discord-notify
browse discord-notify "Smoke test passed"
```

Without a message, the plugin sends the current page URL.
