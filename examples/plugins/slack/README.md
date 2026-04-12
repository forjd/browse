# Slack Plugin Starter

Loads a `slack-notify` command that sends a message to a Slack incoming webhook.

## Setup

1. Add the plugin to `browse.config.json`:

```json
{
  "plugins": ["./examples/plugins/slack/index.ts"]
}
```

2. Set `BROWSE_SLACK_WEBHOOK_URL` to your Slack incoming webhook URL.

## Usage

```bash
browse slack-notify
browse slack-notify "Smoke test passed"
```

Without a message, the plugin sends the current page URL.
