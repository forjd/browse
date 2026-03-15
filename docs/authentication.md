# Authentication

## Overview

There are three approaches to authentication with `browse`:

1. **Configured login** — automated via `browse.config.json` (recommended)
2. **Manual login** — interactive via snapshot/fill/click
3. **Auth state save/load** — persist and restore sessions

## Configured Login

### Setup

Define environments in `browse.config.json`:

```json
{
  "environments": {
    "staging": {
      "loginUrl": "https://staging.example.com/login",
      "userEnvVar": "STAGING_USER",
      "passEnvVar": "STAGING_PASS",
      "usernameField": "Email",
      "passwordField": "Password",
      "submitButton": "Sign in",
      "successCondition": { "urlContains": "/dashboard" }
    },
    "production": {
      "loginUrl": "https://app.example.com/login",
      "userEnvVar": "PROD_USER",
      "passEnvVar": "PROD_PASS",
      "successCondition": { "elementVisible": ".dashboard" }
    }
  }
}
```

### Environment Variables

Set credentials as environment variables (never store them in config):

```sh
export STAGING_USER="user@example.com"
export STAGING_PASS="secretpassword"
```

### Running

```sh
browse login --env staging
```

The command:

1. Navigates to `loginUrl`
2. Fills username and password fields (using selectors if provided, or auto-detecting)
3. Clicks the submit button (if provided, or auto-detecting)
4. Waits for `successCondition` to be met
5. Reports success or failure

### Success Conditions

| Condition | Example | Use When |
|-----------|---------|----------|
| `urlContains` | `{ "urlContains": "/dashboard" }` | Login redirects to a known URL |
| `urlPattern` | `{ "urlPattern": "^https://app\\.example\\.com" }` | URL matches a regex |
| `elementVisible` | `{ "elementVisible": ".dashboard" }` | A specific element appears after login |

### Optional Fields

- `usernameField`, `passwordField`, `submitButton` — accessible names (not CSS selectors). The login handler uses `page.getByRole()` to locate elements by their accessible name.
- If omitted, the defaults are: `"Username"` / `"Email"` for the username field, `"Password"` for the password field, and `"Sign in"` / `"Log in"` for the submit button.
- When provided, these give precise control over which elements to target.

## Manual Login

For sites without a standard login form (OAuth, magic links, etc.):

```sh
browse goto https://app.example.com/login
browse snapshot
browse fill @e1 "user@example.com"
browse fill @e2 "password123"
browse click @e3
browse wait url /dashboard
browse snapshot        # verify login succeeded
```

## Auth State Save/Load

Persist a logged-in session and restore it later.

### Save

```sh
browse auth-state save /tmp/auth.json
```

Exports cookies and localStorage to a JSON file.

### Load

```sh
browse auth-state load /tmp/auth.json
```

Restores cookies and localStorage from the file.

### Use Cases

- Save state after a slow or complex login (OAuth, 2FA) and reuse it across test runs.
- Share auth state between CI jobs.
- Avoid repeated logins during development.

### Session Lifecycle

- Auth state is tied to the browser context. In shared sessions, loaded state is visible to all sessions sharing that context.
- In isolated sessions (`--isolated`), each session has its own auth state.
- `browse wipe` clears all session data (cookies, localStorage, sessionStorage, tabs, and buffers).

## Login in Flows

Use the `login` step type in flows to authenticate as part of an automation sequence:

```json
{
  "steps": [
    { "login": "staging" },
    { "goto": "{{base_url}}/settings" },
    { "assert": { "visible": ".settings-form" } }
  ]
}
```

## Clearing Session Data

```sh
browse wipe
```

Clears all cookies, localStorage, sessionStorage, tabs, and buffers without stopping the daemon. Useful before switching accounts or at the end of a test run.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Login fails silently | Check env vars are set (`echo $STAGING_USER`) |
| Login succeeds but page doesn't load | Check `successCondition` — try a broader `urlContains` |
| Wrong fields detected | Provide explicit selectors in config |
| OAuth/SSO redirect | Use manual login + auth-state save |
| 2FA prompt | Use manual login, handle 2FA interactively, then save auth state |

## Daemon Socket Authentication

The daemon socket is protected by a shared-secret token to prevent unauthorized processes from executing commands. This is separate from web application authentication described above.

- A 256-bit random token is generated at daemon startup
- The token is stored at `/tmp/browse-daemon.token` with `0o600` permissions (owner-readable only)
- The CLI reads this token and includes it in every request
- The daemon validates the token before processing any command
- The token file is cleaned up on daemon shutdown

This prevents any local process from executing arbitrary JavaScript via `browse eval` through the Unix socket. No configuration is required — token management is fully automatic.

## See Also

- [Configuration](configuration.md)
- [Flows and Healthchecks](flows-and-healthchecks.md)
- [The Ref System](refs.md)
