# Official Plugin Starters

Browse now ships first-party starter plugins for common team integrations. Each one is a normal browse plugin that you can load directly from this repository while the standalone npm packages are still being formalised.

## Available starters

- `./examples/plugins/slack/index.ts` — post a message to a Slack webhook
- `./examples/plugins/discord/index.ts` — post a message to a Discord webhook
- `./examples/plugins/jira/index.ts` — create a JIRA issue for the current page

Register any of them in `browse.config.json`:

```json
{
  "plugins": ["./examples/plugins/slack/index.ts"]
}
```

See each plugin directory for setup details and environment variables.
