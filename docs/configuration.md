# Configuration Reference

The `browse` CLI tool uses an optional `browse.config.json` file for environment login, reusable flows, permission checks, and health checks.

## File Location

The config file is resolved in the following order:

1. **Explicit path** — `--config <path>` flag on any command
2. **Upward directory search** — walks from the current working directory towards the filesystem root looking for `browse.config.json`
3. **Global fallback** — `~/.browse/config.json`

If no config file is found at any location, browse runs without configuration (login, flows, healthcheck, and permissions are unavailable).

- The file is loaded once at daemon startup.
- Changes require stopping and restarting the daemon: run `browse quit`, then issue any command to start a fresh daemon.

**Examples:**

```bash
browse goto https://example.com                              # uses auto-discovered config
browse --config /path/to/browse.config.json flow smoke-test  # explicit config path
```

## Top-Level Schema

```typescript
type BrowseConfig = {
  environments: Record<string, EnvironmentConfig>;  // Required
  flows?: Record<string, FlowConfig>;               // Optional
  permissions?: Record<string, PermissionConfig>;    // Optional
  healthcheck?: HealthcheckConfig;                   // Optional
  timeout?: number;                                  // Optional, default 30000ms
  proxy?: ProxyConfig;                               // Optional
  playwright?: PlaywrightPassthrough;                // Optional
};
```

## Environments (required)

Environments define login targets used by `browse login --env <name>`. Credentials are read from environment variables — never stored in the config file.

```typescript
type EnvironmentConfig = {
  loginUrl: string;          // URL to navigate to for login
  userEnvVar: string;        // Env var containing the username
  passEnvVar: string;        // Env var containing the password
  usernameField?: string;    // Accessible name for username input (default: "Username" or "Email")
  passwordField?: string;    // Accessible name for password input (default: "Password")
  submitButton?: string;     // Accessible name for submit button (default: "Sign in" or "Log in")
  successCondition: SuccessCondition;  // How to verify login succeeded
};

type SuccessCondition =
  | { urlContains: string }
  | { urlPattern: string }
  | { elementVisible: string };
```

### Example

```json
{
  "environments": {
    "staging": {
      "loginUrl": "https://staging.example.com/login",
      "userEnvVar": "STAGING_USER",
      "passEnvVar": "STAGING_PASS",
      "successCondition": { "urlContains": "/dashboard" }
    },
    "production": {
      "loginUrl": "https://app.example.com/login",
      "userEnvVar": "PROD_USER",
      "passEnvVar": "PROD_PASS",
      "usernameField": "Email address",
      "passwordField": "Password",
      "submitButton": "Sign in",
      "successCondition": { "elementVisible": "[data-testid='user-menu']" }
    }
  }
}
```

Required fields for every environment: `loginUrl`, `userEnvVar`, `passEnvVar`, and `successCondition`.

The optional fields `usernameField`, `passwordField`, and `submitButton` are **accessible names** (not CSS selectors). The login handler uses `page.getByRole("textbox", { name })` and `page.getByRole("button", { name })` to locate elements. If omitted, the defaults are: `"Username"` / `"Email"` for the username field, `"Password"` for the password field, and `"Sign in"` / `"Log in"` for the submit button.

## Flows (optional)

Flows are reusable automation sequences run with `browse flow <name>`.

```typescript
type FlowConfig = {
  description?: string;
  variables?: string[];      // Variable names expected (passed via --var)
  steps: FlowStep[];
};

type FlowStep =
  | { goto: string }
  | { click: string }                    // Element name (accessible name)
  | { fill: Record<string, string> }     // field name → value
  | { select: Record<string, string> }   // field name → option
  | { screenshot: true | string }        // true = auto-path, string = custom path
  | { console: "error" | "warning" | "all" }
  | { network: true }
  | { wait: WaitCondition }
  | { assert: AssertCondition }
  | { login: string }                    // environment name
  | { snapshot: true }
  | { if: { condition: FlowCondition; then: FlowStep[]; else?: FlowStep[] } }
  | { while: { condition: FlowCondition; steps: FlowStep[]; maxIterations?: number } };

type FlowCondition =
  | { urlContains: string }
  | { urlPattern: string }
  | { elementVisible: string }
  | { elementNotVisible: string }
  | { textVisible: string };
```

### Variables

Variables use `{{varName}}` syntax and are interpolated into all string values within steps. Pass them on the command line with `--var`:

```bash
browse flow create-user --var name="Alice" --var role="admin"
```

### Example

```json
{
  "flows": {
    "create-user": {
      "description": "Create a new user and verify the confirmation page",
      "variables": ["name", "role"],
      "steps": [
        { "login": "staging" },
        { "goto": "https://staging.example.com/admin/users/new" },
        { "fill": { "Full name": "{{name}}", "Email": "{{name}}@example.com" } },
        { "select": { "Role": "{{role}}" } },
        { "click": "Create user" },
        { "wait": { "textVisible": "User created successfully" } },
        { "assert": { "urlContains": "/admin/users/" } },
        { "screenshot": true }
      ]
    }
  }
}
```

## Wait Conditions

Wait conditions pause flow execution until a condition is met. Used in flow steps via `{ wait: WaitCondition }`.

```typescript
type WaitCondition =
  | { urlContains: string }
  | { urlPattern: string }
  | { elementVisible: string }
  | { textVisible: string }
  | { timeout: number };
```

- `urlContains` — waits until the page URL includes the given substring.
- `urlPattern` — waits until the page URL matches the given regex pattern.
- `elementVisible` — waits until an element matching the CSS selector is visible.
- `textVisible` — waits until the given text appears on the page.
- `timeout` — waits for a fixed number of milliseconds.

## Assert Conditions

Assert conditions verify page state. Used in flows, healthchecks, and permissions.

```typescript
type AssertCondition =
  | { visible: string }
  | { notVisible: string }
  | { textContains: string }
  | { textNotContains: string }
  | { urlContains: string }
  | { urlPattern: string }
  | { elementText: { selector: string; contains: string } }
  | { elementCount: { selector: string; count: number } };
```

- `visible` / `notVisible` — checks whether an element matching the CSS selector is visible or hidden.
- `textContains` / `textNotContains` — checks whether the page body contains (or does not contain) the given text.
- `urlContains` — checks that the current URL includes the substring.
- `urlPattern` — checks that the current URL matches the regex pattern.
- `elementText` — checks that the text content of the element matching `selector` contains the given string.
- `elementCount` — checks that the number of elements matching `selector` equals `count`.

## Permissions (optional)

Permission configs define pages and conditions for verifying access control. Each entry describes what a granted or denied state looks like.

```typescript
type PermissionConfig = {
  page: string;              // URL to check
  granted: AssertCondition;  // Condition when permission is granted
  denied: AssertCondition;   // Condition when permission is denied
};
```

### Example

```json
{
  "permissions": {
    "admin-panel": {
      "page": "https://staging.example.com/admin",
      "granted": { "visible": "[data-testid='admin-dashboard']" },
      "denied": { "textContains": "Access denied" }
    }
  }
}
```

## Healthcheck (optional)

Multi-page health checks run with `browse healthcheck`. Each page is loaded and checked in sequence.

```typescript
type HealthcheckConfig = {
  pages: HealthcheckPage[];
};

type HealthcheckPage = {
  url: string;
  name?: string;
  screenshot?: boolean;
  console?: "error" | "warning";
  assertions?: AssertCondition[];
};
```

Variables from `--var` are interpolated into page URLs, so you can parameterise the base URL or other dynamic segments.

### Example

```json
{
  "healthcheck": {
    "pages": [
      {
        "url": "https://{{host}}/",
        "name": "Homepage",
        "screenshot": true,
        "console": "error",
        "assertions": [
          { "visible": "header" },
          { "textContains": "Welcome" }
        ]
      },
      {
        "url": "https://{{host}}/api/health",
        "name": "API Health",
        "assertions": [
          { "textContains": "\"status\":\"ok\"" }
        ]
      }
    ]
  }
}
```

## Proxy (optional)

Route all browser traffic through an HTTP or SOCKS proxy.

```typescript
type ProxyConfig = {
  server: string;      // Required — proxy URL (e.g. "http://proxy:8080", "socks5://proxy:1080")
  bypass?: string;     // Optional — comma-separated list of hosts to bypass
  username?: string;   // Optional — proxy auth username
  password?: string;   // Optional — proxy auth password
};
```

### Example

```json
{
  "proxy": {
    "server": "http://proxy.corp.example.com:8080",
    "bypass": "localhost,*.internal.example.com",
    "username": "proxyuser",
    "password": "proxypass"
  }
}
```

The proxy can also be set via the `--proxy` CLI flag or the `BROWSE_PROXY` environment variable (both accept a URL string). Precedence: `--proxy` flag > `BROWSE_PROXY` env var > config file.

The proxy is applied to all browser contexts, including isolated sessions, test-matrix roles, and video recording contexts.

## Timeout (optional)

Global timeout override in milliseconds. The default is 30000 (30 seconds). This applies to all commands that wait for conditions.

```json
{
  "timeout": 60000
}
```

Individual commands can override this value with the `--timeout` flag.

## Playwright Passthrough (optional)

Pass arbitrary Playwright launch and context options directly, without waiting for `browse` to add explicit support. Options are spread into the underlying Playwright calls — browse's own options (headless, viewport, stealth) take precedence on conflict.

```typescript
type PlaywrightPassthrough = {
  launchOptions?: Record<string, unknown>;   // Spread into launchPersistentContext()
  contextOptions?: Record<string, unknown>;  // Spread into browser.newContext()
};
```

- `launchOptions` — applied when the daemon starts the browser. Useful for locale, timezone, proxy, and other browser-level settings.
- `contextOptions` — applied when creating isolated session contexts and video recording contexts.

### Example

```json
{
  "playwright": {
    "launchOptions": {
      "locale": "fr-FR",
      "timezoneId": "Europe/Paris"
    },
    "contextOptions": {
      "colorScheme": "dark",
      "geolocation": { "latitude": 48.8566, "longitude": 2.3522 },
      "permissions": ["geolocation"]
    }
  }
}
```

Both sub-keys must be plain objects if present. See the [Playwright BrowserContext docs](https://playwright.dev/docs/api/class-browser#browser-new-context) for the full list of available options.

## Validation

The config file is validated on load. Invalid configs produce clear error messages identifying the problem. The following fields are required for each environment entry:

- `loginUrl`
- `userEnvVar`
- `passEnvVar`
- `successCondition`

## Full Example

```json
{
  "environments": {
    "staging": {
      "loginUrl": "https://staging.example.com/login",
      "userEnvVar": "STAGING_USER",
      "passEnvVar": "STAGING_PASS",
      "successCondition": { "urlContains": "/dashboard" }
    },
    "production": {
      "loginUrl": "https://app.example.com/login",
      "userEnvVar": "PROD_USER",
      "passEnvVar": "PROD_PASS",
      "usernameField": "Email address",
      "passwordField": "Password",
      "submitButton": "Sign in",
      "successCondition": { "elementVisible": "[data-testid='user-menu']" }
    }
  },
  "proxy": {
    "server": "http://proxy.corp.example.com:8080",
    "bypass": "localhost,*.internal.example.com"
  },
  "flows": {
    "smoke-test": {
      "description": "Log in and verify the dashboard loads",
      "steps": [
        { "login": "staging" },
        { "goto": "https://staging.example.com/dashboard" },
        { "assert": { "visible": "[data-testid='dashboard-stats']" } },
        { "screenshot": true }
      ]
    },
    "create-order": {
      "description": "Create an order with the given product",
      "variables": ["product", "quantity"],
      "steps": [
        { "login": "staging" },
        { "goto": "https://staging.example.com/orders/new" },
        { "fill": { "Product": "{{product}}", "Quantity": "{{quantity}}" } },
        { "click": "Place order" },
        { "wait": { "textVisible": "Order confirmed" } },
        { "assert": { "urlPattern": "/orders/\\d+" } },
        { "screenshot": true }
      ]
    }
  },
  "permissions": {
    "admin-panel": {
      "page": "https://staging.example.com/admin",
      "granted": { "visible": "[data-testid='admin-dashboard']" },
      "denied": { "textContains": "Access denied" }
    },
    "billing": {
      "page": "https://staging.example.com/billing",
      "granted": { "visible": ".billing-overview" },
      "denied": { "urlContains": "/unauthorised" }
    }
  },
  "healthcheck": {
    "pages": [
      {
        "url": "https://staging.example.com/",
        "name": "Homepage",
        "screenshot": true,
        "console": "error",
        "assertions": [
          { "visible": "header" },
          { "textContains": "Welcome" }
        ]
      },
      {
        "url": "https://staging.example.com/login",
        "name": "Login page",
        "assertions": [
          { "visible": "form" },
          { "elementCount": { "selector": "input", "count": 2 } }
        ]
      },
      {
        "url": "https://staging.example.com/api/health",
        "name": "API Health",
        "assertions": [
          { "textContains": "\"status\":\"ok\"" }
        ]
      }
    ]
  },
  "playwright": {
    "launchOptions": {
      "locale": "en-GB",
      "timezoneId": "Europe/London"
    },
    "contextOptions": {
      "colorScheme": "dark"
    }
  },
  "timeout": 45000
}
```

## See Also

- [Flows and Healthchecks](flows-and-healthchecks.md)
- [Authentication](authentication.md)
