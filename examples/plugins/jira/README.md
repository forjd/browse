# JIRA Plugin Starter

Loads a `jira-create` command that creates a JIRA issue for the current page.

## Setup

1. Add the plugin to `browse.config.json`:

```json
{
  "plugins": ["./examples/plugins/jira/index.ts"]
}
```

2. Set these environment variables:

- `BROWSE_JIRA_BASE_URL`
- `BROWSE_JIRA_EMAIL`
- `BROWSE_JIRA_API_TOKEN`
- `BROWSE_JIRA_PROJECT_KEY`
- `BROWSE_JIRA_ISSUE_TYPE` (optional, defaults to `Task`)

## Usage

```bash
browse jira-create
browse jira-create "Broken settings page"
```

Without a summary, the plugin uses the current page URL.
