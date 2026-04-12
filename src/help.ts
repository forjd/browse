import { FLOW_REPORTER_HELP } from "./reporters.ts";

type CommandHelp = {
	summary: string;
	usage: string;
};

export const COMMANDS: Record<string, CommandHelp> = {
	goto: {
		summary: "Navigate to URL, return page title",
		usage: `browse goto <url> [--viewport <WxH>] [--device <name>] [--preset <name>]

Flags:
  --viewport <WxH>   Set viewport before navigating (e.g. 320x568)
  --device <name>    Use a Playwright device (e.g. "iPhone SE")
  --preset <name>    Use a preset: mobile (375x667), tablet (768x1024), desktop (1440x900)`,
	},
	text: {
		summary: "Return visible text content",
		usage: "browse text",
	},
	snapshot: {
		summary: "Show page elements with refs",
		usage: `browse snapshot [-i] [-f] [--json]

Flags:
  -i       Include structural nodes with names (inclusive mode)
  -f       Include all nodes in tree (full mode)
  --json   Output as JSON

Default mode shows only interactive elements.`,
	},
	click: {
		summary: "Click an element by ref",
		usage: "browse click <@ref>",
	},
	hover: {
		summary: "Hover over an element by ref",
		usage: `browse hover <@ref> [--duration <ms>]

Flags:
  --duration <ms>   Hold the hover for the given duration (useful for delayed tooltips)`,
	},
	fill: {
		summary: "Fill an input by ref",
		usage: `browse fill <@ref> <value>

Fills a text input field. Supported roles: textbox, searchbox, spinbutton, combobox.`,
	},
	select: {
		summary: "Select a dropdown option by ref",
		usage: `browse select <@ref> <option>

Selects an option in a dropdown. Supported roles: combobox, listbox.`,
	},
	scroll: {
		summary: "Scroll the page or an element into view",
		usage: `browse scroll down               Scroll down one viewport height
browse scroll up                 Scroll up one viewport height
browse scroll top                Scroll to top of page
browse scroll bottom             Scroll to bottom of page
browse scroll <@ref>             Scroll element into view
browse scroll <x> <y>            Scroll to coordinates`,
	},
	press: {
		summary: "Send keyboard key presses",
		usage: `browse press <key> [key ...]

Press one or more keys sequentially. Supports single keys, combinations
with +, and multiple keys in one command.

Examples:
  browse press Tab                 Single key
  browse press Tab Tab Tab         Multiple sequential keys
  browse press Shift+Tab           Key combination
  browse press Escape              Close modals/popovers
  browse press Enter               Submit/activate
  browse press ArrowDown           Navigate within menus
  browse press Control+a           Select all

Key names follow Playwright conventions (Tab, Enter, Escape, ArrowDown, etc.).`,
	},
	screenshot: {
		summary: "Take a screenshot",
		usage: `browse screenshot [path] [--viewport] [--selector <css-selector>] [--diff <baseline>] [--threshold <n>]

Flags:
  --viewport              Screenshot only the viewport (not full page)
  --selector <selector>   Screenshot only the element matching the selector
  --diff <baseline.png>   Compare against a baseline image and produce a diff image + similarity score
  --threshold <n>         Per-channel diff threshold (0-255, default: 10). Pixels with all channel diffs below this are considered identical.

If no path is given, saves to ~/.bun-browse/screenshots/ with a timestamp.
With --diff, outputs similarity percentage, diff pixel count, and path to the diff image.`,
	},
	console: {
		summary: "Show console messages",
		usage: `browse console [--level <level>] [--keep] [--json]

Flags:
  --level <level>   Filter by level: log, info, warning, error, debug
  --keep            Peek at messages without draining buffer
  --json            Output as JSON`,
	},
	network: {
		summary: "Show network requests",
		usage: `browse network [--all] [--keep] [--json]

Flags:
  --all    Show all requests (default: status >= 400 only)
  --keep   Peek at requests without draining buffer
  --json   Output as JSON`,
	},
	"auth-state": {
		summary: "Save or load auth state",
		usage: `browse auth-state save <path>   Save cookies and localStorage to file
browse auth-state load <path>   Load cookies and localStorage from file`,
	},
	login: {
		summary: "Log in using configured environment",
		usage: `browse login --env <environment>

Flags:
  --env <environment>   Required. Environment name from browse.config.json

Credentials are read from environment variables defined in the config.`,
	},
	tab: {
		summary: "Manage browser tabs",
		usage: `browse tab list              List open tabs
browse tab new [url]         Open new tab (optionally at URL)
browse tab switch <index>    Switch to tab (1-indexed)
browse tab close [index]     Close tab (closes active tab if no index)`,
	},
	flow: {
		summary: "Execute a named flow",
		usage: `browse flow list                          List defined flows
browse flow <name> [--var k=v ...] [--continue-on-error] [--reporter <format>] [--dry-run] [--stream] [--webhook <url>]

Flags:
  --var key=value       Pass variables to flow (repeatable)
  --continue-on-error   Continue running steps even if one fails
  --reporter <format>   Output format: ${FLOW_REPORTER_HELP}, or a plugin-provided reporter name
  --dry-run             Preview step plan without executing
  --stream              Emit step results as NDJSON as they complete
  --webhook <url>       POST a JSON result payload to the URL on completion

Flows can be defined inline in browse.config.json or as individual JSON files
in a flows/ directory next to the config file. Global flows in ~/.browse/flows/
are also loaded. Inline flows take precedence over file-based flows.
Flows support conditional logic (if/else) and loops (while) with condition
expressions.`,
	},
	assert: {
		summary: "Assert a condition (PASS/FAIL)",
		usage: `browse assert <type> <args...> [--json]

Types:
  visible <selector|@ref>              Element is visible
  not-visible <selector|@ref>          Element is not visible
  text-contains <text>                 Page contains text
  text-not-contains <text>             Page does not contain text
  url-contains <substring>             URL contains substring
  url-pattern <regex>                  URL matches regex
  element-text <selector|@ref> <text>  Element text contains value
  element-count <selector|@ref> <n>    Element count matches
  permission <name> granted|denied [--var k=v ...]

Flags:
  --json   Output as JSON`,
	},
	healthcheck: {
		summary: "Run healthcheck across configured pages",
		usage: `browse healthcheck [--var k=v ...] [--no-screenshots] [--reporter <format>] [--parallel] [--concurrency N] [--webhook <url>]

Flags:
  --var key=value       Pass variables for URL interpolation (repeatable)
  --no-screenshots      Skip screenshot capture
  --reporter <format>   Output format: junit (JUnit XML), json (structured JSON), markdown (human-readable Markdown)
  --parallel            Check pages concurrently using separate browser tabs
  --concurrency <N>     Max pages to check in parallel (default: 5, requires --parallel)
  --webhook <url>       POST a JSON result payload to the URL on completion

Pages are defined in browse.config.json.`,
	},
	wipe: {
		summary: "Clear all session data",
		usage:
			"browse wipe\n\nClears cookies, localStorage, sessionStorage, tabs, and buffers without stopping the daemon.",
	},
	benchmark: {
		summary: "Measure command latency",
		usage: `browse benchmark [--iterations N] [--json]

Flags:
  --iterations N   Number of iterations (default: 10)
  --json           Emit structured benchmark output for automation`,
	},
	batch: {
		summary: "Run multiple commands in one daemon round-trip",
		usage: `browse batch <commands.json> [--continue-on-error] [--json]

Accepts either a JSON array of command objects or an object with a top-level
\`batch\` array. Global flags such as \`--timeout\`, \`--session\`, and \`--json\`
apply to the whole batch unless an entry overrides them.

Flags:
  --continue-on-error   Continue running entries after a failure
  --json                Print the raw batch response as JSON`,
	},
	viewport: {
		summary: "Get or set browser viewport size",
		usage: `browse viewport                  Show current viewport size
browse viewport <width> <height>  Set viewport (e.g. 320 568)
browse viewport <WxH>            Set viewport (e.g. 320x568)

Flags:
  --device <name>    Use a Playwright device (e.g. "iPhone SE", "iPad (gen 7)")
  --preset <name>    Use a preset: mobile (375x667), tablet (768x1024), desktop (1440x900)`,
	},
	eval: {
		summary: "Run JavaScript in the page context",
		usage: `browse eval <expression>

Evaluates a JavaScript expression in the browser page context using page.evaluate().
Returns the result as a string (objects are JSON-stringified).

Examples:
  browse eval "document.title"
  browse eval "document.querySelector('h1').textContent"
  browse eval "window.innerWidth"
  browse eval "getComputedStyle(document.body).backgroundColor"`,
	},
	"page-eval": {
		summary: "Run Playwright page-level operations",
		usage: `browse page-eval <expression>

Evaluates an expression with access to the Playwright \`page\` object.
Supports async/await. Returns the result as a string.

Examples:
  browse page-eval "await page.title()"
  browse page-eval "page.url()"
  browse page-eval "page.viewportSize()"
  browse page-eval "await page.evaluate(() => document.title)"`,
	},
	wait: {
		summary: "Wait for a condition before proceeding",
		usage: `browse wait url <substring>        Wait until URL contains substring
browse wait text <string>          Wait until page text contains string
browse wait visible <selector|@ref>    Wait until element is visible
browse wait hidden <selector|@ref>     Wait until element disappears
browse wait network-idle           Wait until no pending network requests
browse wait <ms>                   Wait for a fixed delay (last resort)

Respects --timeout flag. Polls at 100ms intervals.`,
	},
	url: {
		summary: "Print the current page URL",
		usage: "browse url",
	},
	back: {
		summary: "Navigate back in history",
		usage: "browse back",
	},
	forward: {
		summary: "Navigate forward in history",
		usage: "browse forward",
	},
	reload: {
		summary: "Reload the current page",
		usage: `browse reload [--hard]

Flags:
  --hard   Clear browser cache before reloading`,
	},
	attr: {
		summary: "Read element attributes by ref",
		usage: `browse attr <@ref> [attribute]

Examples:
  browse attr @e1 href              Get a single attribute value
  browse attr @e1 aria-current      Check ARIA attributes
  browse attr @e1 class             Get class list
  browse attr @e1                   Show all attributes as key=value pairs`,
	},
	upload: {
		summary: "Set file(s) on a file input by ref",
		usage: `browse upload <@ref> <file> [file ...]

Sets one or more files on an <input type="file"> element using Playwright's setInputFiles().

Examples:
  browse upload @e5 /path/to/file.pdf
  browse upload @e5 /path/to/a.jpg /path/to/b.jpg`,
	},
	a11y: {
		summary: "Run accessibility audit (axe-core)",
		usage: `browse a11y [options] [@ref]

Flags:
  --standard <std>   WCAG standard: wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice
  --json             Output results as JSON (for CI)
  --include <sel>    Scope audit to a CSS selector
  --exclude <sel>    Exclude a CSS selector from audit

Scoping:
  browse a11y @e5                    Audit a specific element by ref
  browse a11y --include ".main"      Audit a CSS selector region
  browse a11y --exclude ".ads"       Exclude a region

Examples:
  browse a11y                        Full page audit
  browse a11y --standard wcag2aa     WCAG 2.0 AA only
  browse a11y --standard wcag21aa    WCAG 2.1 AA
  browse a11y --json                 Machine-readable output`,
	},
	help: {
		summary: "Show help for a command",
		usage: `browse help [command]

Without arguments, shows an overview of all commands.
With a command name, shows detailed usage for that command.`,
	},
	quit: {
		summary: "Shut down the daemon",
		usage: "browse quit",
	},
	version: {
		summary: "Print version and platform info",
		usage: "browse version",
	},
	plugins: {
		summary: "Discover official and community plugins",
		usage: `browse plugins official
browse plugins search [query...] [--page <n>] [--limit <n>]

Subcommands:
  official             List first-party Browse plugins
  search [query...]    Search npm for packages tagged with the browse-plugin keyword

Flags:
  --page <n>           Result page number (default: 1)
  --limit <n>          Results per page (default: 20, max: 250)
  --json               Output JSON`,
	},
	session: {
		summary: "Manage browser sessions",
		usage: `browse session list              List all sessions
browse session create <name>     Create a new session (shared context)
browse session create <name> --isolated   Create with isolated browser context
browse session close <name>      Close a session and its pages

Flags:
  --isolated    Create a fully isolated browser context (separate cookies, storage)

Use --session <name> on any command to route it to a named session:
  browse --session worker-1 goto https://example.com
  browse --session worker-1 snapshot`,
	},
	ping: {
		summary: "Check if daemon is alive",
		usage: "browse ping\n\nReturns 'pong' if the daemon is running.",
	},
	status: {
		summary: "Show daemon status and health info",
		usage: `browse status [--json] [--watch [--interval N]] [--exit-code] [--metrics]

Shows daemon PID, uptime, memory usage, browser version, session count,
total tabs, and per-session details.

Flags:
  --json               Returns structured JSON with all health metrics
  --watch              Continuously poll and display status
  --interval <seconds> Polling interval for --watch (default: 5)
  --exit-code          Exit 0 if daemon is healthy, 1 if unhealthy (for CI/container probes)
  --metrics            Output Prometheus-style daemon metrics

Examples:
  browse status                            One-shot status
  browse status --json                     Structured JSON output
  browse status --watch                    Live-updating status (every 5s)
  browse status --watch --interval 10      Poll every 10 seconds
  browse status --watch --json             NDJSON stream for monitoring
  browse status --exit-code                Health probe (exit code only)
  browse status --metrics                  Prometheus metrics output`,
	},
	dialog: {
		summary: "Handle browser dialogs (alert, confirm, prompt)",
		usage: `browse dialog accept [text]      Accept pending dialog (optional input text)
browse dialog dismiss            Dismiss pending dialog
browse dialog status             Show pending dialog info and auto-mode
browse dialog auto-accept        Automatically accept all future dialogs
browse dialog auto-dismiss       Automatically dismiss all future dialogs
browse dialog auto-off           Disable auto-mode (queue dialogs)`,
	},
	download: {
		summary: "Wait for and save file downloads with optional verification",
		usage: `browse download wait [--save-to <path>] [--timeout <ms>]
  [--expect-type <mime>] [--expect-min-size <bytes>] [--expect-max-size <bytes>]

Flags:
  --save-to <path>           Save downloaded file to this path
  --timeout <ms>             Timeout for waiting (default: 30000)
  --expect-type <mime>       Validate file MIME type (e.g. application/pdf)
  --expect-min-size <bytes>  Minimum file size in bytes
  --expect-max-size <bytes>  Maximum file size in bytes

Response includes: filename, path, url, size, and MIME type.
Returns an error if the download fails or validation checks do not pass.`,
	},
	frame: {
		summary: "Navigate and inspect iframes",
		usage: `browse frame list                 List all frames
browse frame switch <target>     Switch to frame by index, name, or URL substring
browse frame main                Show main frame info`,
	},
	intercept: {
		summary: "Mock or block network requests",
		usage: `browse intercept add <pattern> [--status N] [--body data] [--content-type type]
browse intercept remove <pattern>
browse intercept list
browse intercept clear

Flags:
  --status <N>            HTTP status code (default: 200)
  --body <data>           Response body (default: "")
  --content-type <type>   Content type (default: application/json)

Examples:
  browse intercept add "**/api/users" --body '{"users":[]}'
  browse intercept add "**/analytics/**" --status 204
  browse intercept clear`,
	},
	cookies: {
		summary: "Inspect browser cookies",
		usage: `browse cookies [--domain <domain>] [--json]

Flags:
  --domain <domain>   Filter cookies by domain substring
  --json              Output as JSON`,
	},
	storage: {
		summary: "Inspect localStorage or sessionStorage",
		usage: `browse storage local [--json]      Show localStorage entries
browse storage session [--json]  Show sessionStorage entries

Flags:
  --json   Output as JSON`,
	},
	html: {
		summary: "Get page or element HTML",
		usage: `browse html [selector|@ref]

Without arguments, returns full page HTML.
With a selector or ref, returns outerHTML of that element.`,
	},
	title: {
		summary: "Get the page title",
		usage: "browse title",
	},
	pdf: {
		summary: "Export page as PDF",
		usage: `browse pdf [path]

If no path given, saves to ~/.bun-browse/exports/ with a timestamp.`,
	},
	"element-count": {
		summary: "Count elements matching a selector",
		usage: `browse element-count <selector|@ref>

Returns the number of elements matching the selector.`,
	},
	trace: {
		summary: "Record, view, and manage Playwright traces",
		usage: `browse trace start [--screenshots] [--snapshots]   Start recording
browse trace stop [--out <path>]                   Stop and save trace
browse trace view [<path>] [--latest] [--port <n>] Open trace in viewer
browse trace list                                  List saved traces
browse trace clean [--older-than <duration>] [--dry-run]  Delete saved traces
browse trace status                                Check recording status

Flags:
  --screenshots   Capture screenshots during recording
  --snapshots     Capture DOM snapshots during recording
  --out <path>    Output path for trace file (default: ~/.bun-browse/traces/)
  --latest        View the most recent trace
  --port <n>      Serve trace viewer on a specific port
  --older-than    Delete only traces older than the given duration
  --dry-run       Preview cleanup candidates without deleting them`,
	},
	init: {
		summary: "Generate a browse.config.json template",
		usage: `browse init [path] [--force]

Flags:
  --force   Overwrite existing config file

Generates a template browse.config.json with sample environments,
flows, and healthcheck configuration.`,
	},
	screenshots: {
		summary: "Manage screenshot files",
		usage: `browse screenshots list                    List all screenshots
browse screenshots clean [--older-than <duration>] [--dry-run]   Delete screenshots
browse screenshots count                  Show count and total size

Flags:
  --older-than <duration>   Only delete screenshots older than duration (e.g. 7d, 24h, 30m)
  --dry-run                 Show what would be deleted without removing files

Automatic retention can also be set in browse.config.json:
  "artifacts": { "retention": { "screenshots": "7d" } }`,
	},
	report: {
		summary: "Generate an HTML QA report",
		usage: `browse report --out <path> [--title <title>] [--screenshots <dir>]

Flags:
  --out <path>          Output path for the HTML report (required)
  --title <title>       Report title (default: "Browse QA Report")
  --screenshots <dir>   Directory containing screenshots (default: ~/.bun-browse/screenshots/)`,
	},
	completions: {
		summary: "Generate shell completion scripts",
		usage: `browse completions <shell>

Supported shells: bash, zsh, fish

Install completions:
  browse completions bash > ~/.local/share/bash-completion/completions/browse
  browse completions zsh > ~/.zfunc/_browse
  browse completions fish > ~/.config/fish/completions/browse.fish`,
	},
	form: {
		summary: "Bulk fill form fields in one command",
		usage: `browse form --data '{"field":"value",...}' [--auto-snapshot]

Fills multiple form fields in a single command by matching field names/labels
to data keys. Supports text inputs, selects, checkboxes, and radio buttons.

Flags:
  --data <json>        JSON object mapping field names to values (required)
  --auto-snapshot      Take a snapshot after filling to refresh refs

Examples:
  browse form --data '{"Email":"test@example.com","Password":"secret"}'
  browse form --data '{"Name":"John","Country":"US","Newsletter":true}'`,
	},
	"test-matrix": {
		summary: "Run same flow across multiple roles in parallel",
		usage: `browse test-matrix --roles <role1,role2,...> --flow <flow-name> [--env <env>] [--reporter <format>]

Runs the same flow simultaneously across isolated sessions with different
authentication (roles/environments) and diffs the results. Each role maps
to an environment in browse.config.json.

Flags:
  --roles <roles>      Comma-separated list of role names (required)
  --flow <name>        Flow to run for each role (required)
  --env <env>          Environment prefix (e.g., staging → looks for staging-admin, staging-viewer)
  --reporter <format>  Output format: ${FLOW_REPORTER_HELP}, or a plugin-provided reporter name

Examples:
  browse test-matrix --roles admin,viewer,guest --flow checkout
  browse test-matrix --roles admin,viewer --flow dashboard --reporter junit`,
	},
	"assert-ai": {
		summary: "AI-powered visual assertion using a vision model",
		usage: `browse assert-ai "<assertion>" [--model <model>] [--provider <anthropic|openai>] [--base-url <url>]

Takes a viewport screenshot and sends it to a vision model to evaluate
whether the assertion holds. Returns structured PASS/FAIL with reasoning.

Flags:
  --model <model>        Model to use (default: claude-sonnet-4-20250514 for Anthropic, gpt-4o for OpenAI)
  --provider <provider>  AI provider: anthropic (default), openai
  --base-url <url>       Custom API base URL for OpenAI-compatible providers
                         (OpenRouter, Groq, Ollama, Together, etc.)
                         Auto-selects openai provider when set.

Environment variables:
  ANTHROPIC_API_KEY      Required for Anthropic provider (default)
  OPENAI_API_KEY         Required for OpenAI provider (and compatible providers)
  OPENAI_BASE_URL        Custom base URL (alternative to --base-url flag)

Examples:
  browse assert-ai "the page should show a dashboard with 3 charts"
  browse assert-ai "there should be no error banners visible"
  browse assert-ai "the login form has email and password fields" --provider openai
  browse assert-ai "page looks correct" --base-url https://openrouter.ai/api/v1 --model anthropic/claude-sonnet-4-20250514`,
	},
	replay: {
		summary: "Generate interactive session replay HTML",
		usage: `browse replay [--out <path>]     Generate replay from screenshots
browse replay list               List available replay recordings

Generates a standalone HTML page with an interactive timeline of the session,
including embedded screenshots, navigation controls, and keyboard shortcuts.

Flags:
  --out <path>   Output path for the HTML file (default: ~/.bun-browse/replays/)

Keyboard shortcuts in the viewer:
  ← / →          Navigate between events
  Space           Auto-play / pause`,
	},
	diff: {
		summary: "Visual diff between two deployments",
		usage: `browse diff --baseline <url> --current <url> [--flow <name>] [--threshold <n>]

Takes screenshots at each page on both deployments and produces a visual
diff report showing what changed. Useful for PR review workflows.

Flags:
  --baseline <url>     Base deployment URL (e.g., https://main.example.com)
  --current <url>      Current deployment URL (e.g., http://localhost:3000)
  --flow <name>        Flow defining which pages to compare (uses goto steps)
  --threshold <n>      Pixel diff threshold 0-255 (default: 10)
  --var key=value      Pass variables for URL interpolation
  --no-screenshots     Skip saving individual screenshots

Examples:
  browse diff --baseline https://staging.app --current http://localhost:3000
  browse diff --baseline https://main.app --current https://feature.app --flow smoke`,
	},
	video: {
		summary: "Record browser session as video",
		usage: `browse video start [--size <WxH>]               Start recording the active tab
browse video stop [--out <path>]                 Stop and save the video file
browse video status                              Check recording status
browse video list                                List saved videos
browse video clean [--older-than <duration>] [--dry-run]  Delete saved videos

Flags:
  --size <WxH>   Video resolution (default: current viewport or 1280x720)
  --out <path>   Output path for the video file (default: ~/.bun-browse/videos/)
  --older-than   Delete only videos older than the given duration
  --dry-run      Preview cleanup candidates without deleting them

When recording starts, a new browser context is created with video capture
enabled. Cookies are copied from the current session. The recording page
replaces the active tab, so all subsequent commands are captured.

On stop, the video is saved as WebM and the original page is restored.`,
	},
	"flow-share": {
		summary: "Export, import, and share flow definitions",
		usage: `browse flow-share export <name>              Export a flow to .flow.json
browse flow-share import <path>              Import a .flow.json file
browse flow-share list                       List installed shared flows
browse flow-share install <user/repo/flow>   Install from GitHub
browse flow-share publish <name>             Publish to local registry

Examples:
  browse flow-share export checkout
  browse flow-share import ./checkout.flow.json
  browse flow-share install acme/browse-flows/checkout
  browse flow-share list`,
	},
	perf: {
		summary: "Measure page performance (Core Web Vitals)",
		usage: `browse perf [--budget <spec>] [--json]

Collects Core Web Vitals and performance timing metrics for the current page.

Metrics: TTFB, FCP, LCP, CLS, DOM Content Loaded, Page Load, resource count, transfer size.

Flags:
  --budget <spec>   Performance budget check. Comma-separated metric=threshold pairs.
                    Metrics: ttfb, fcp, lcp (ms), cls (score), dcl, load (ms).
  --json            Output as JSON

Examples:
  browse perf
  browse perf --budget lcp=2500,cls=0.1,fcp=1800
  browse perf --json`,
	},
	security: {
		summary: "Run security audit (headers, cookies, mixed content)",
		usage: `browse security [--json]

Audits the current page for common security issues:
  - Security headers (HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)
  - Cookie security flags (Secure, HttpOnly, SameSite)
  - Mixed content detection (HTTP resources on HTTPS pages)

Flags:
  --json   Output as JSON

Examples:
  browse security
  browse security --json`,
	},
	responsive: {
		summary: "Capture screenshots across viewport breakpoints",
		usage: `browse responsive [--breakpoints <spec>] [--url <url>] [--out <dir>] [--json]

Captures full-page screenshots at multiple viewport sizes for responsive testing.

Default breakpoints: mobile (375x667), tablet (768x1024), desktop (1440x900), wide (1920x1080).

Flags:
  --breakpoints <spec>   Custom breakpoints as comma-separated WxH (e.g. 320x568,768x1024,1920x1080)
  --url <url>            URL to test (defaults to current page, reloading at each breakpoint)
  --out <dir>            Output directory (default: ~/.bun-browse/responsive/)
  --json                 Output as JSON

Examples:
  browse responsive
  browse responsive --breakpoints 320x568,768x1024,1920x1080
  browse responsive --url https://example.com --out ./screenshots`,
	},
	record: {
		summary: "Record browser interactions as a flow JSON file",
		usage: `browse record <subcommand> [args]

Subcommands:
  start [--output file.flow.json] [--name "flow-name"]   Start recording interactions
  stop                                                    Stop recording and save flow JSON
  pause                                                   Pause event capture
  resume                                                  Resume event capture

Flags:
  --output <path>   Output file path (default: recording.flow.json)
  --name <name>     Flow name/description (default: recorded-flow)

Captures clicks, fills, selects, and navigations. Collapses rapid keystrokes
into single fill steps. Converts absolute URLs to {{base_url}} variables.

Examples:
  browse record start --output checkout.flow.json --name "checkout flow"
  browse record pause
  browse record resume
  browse record stop`,
	},
	extract: {
		summary: "Extract structured data from the page",
		usage: `browse extract <subcommand> [args] [--json]

Subcommands:
  table <selector|@ref>              Extract HTML table as structured data
  links [--filter <pattern>]         Extract all links with href and text
  meta                               Extract meta tags, Open Graph, Twitter Card, JSON-LD
  select <selector> [--attr <name>]  Extract matching elements' text or attribute

Flags:
  --json              Output as JSON
  --csv               Output table as CSV (table subcommand only)
  --filter <pattern>  Filter links by URL pattern (links subcommand only)
  --attr <name>       Extract specific attribute (select subcommand only)

Examples:
  browse extract table "table.results"
  browse extract links --filter "example\\.com"
  browse extract meta --json
  browse extract select "h2" --attr id`,
	},
	throttle: {
		summary: "Simulate network throttling via CDP",
		usage: `browse throttle <preset|off|status> [--download KB/s] [--upload KB/s] [--latency ms]

Presets:
  slow-3g   50 KB/s ↓, 25 KB/s ↑, 2000ms latency
  3g        187 KB/s ↓, 75 KB/s ↑, 400ms latency
  4g        1500 KB/s ↓, 750 KB/s ↑, 60ms latency
  wifi      3750 KB/s ↓, 1500 KB/s ↑, 20ms latency
  cable     6250 KB/s ↓, 3125 KB/s ↑, 5ms latency

Subcommands:
  browse throttle <preset>         Apply a named preset
  browse throttle off              Disable throttling
  browse throttle status           Show current throttle settings
  browse throttle --download 200 --upload 50 --latency 100   Custom values (KB/s)

Flags:
  --download <KB/s>   Download throughput in KB/s (default: 500)
  --upload <KB/s>     Upload throughput in KB/s (default: 100)
  --latency <ms>      Added latency in ms (default: 0)

Examples:
  browse throttle 3g
  browse throttle slow-3g
  browse throttle --download 100 --upload 50 --latency 500
  browse throttle off`,
	},
	offline: {
		summary: "Simulate offline network conditions via CDP",
		usage: `browse offline <on|off>

Enables or disables offline mode using Chrome DevTools Protocol.
When enabled, all network requests will fail as if the device has no connection.

Examples:
  browse offline on     Enable offline mode
  browse offline off    Disable offline mode`,
	},
	crawl: {
		summary: "Multi-page crawl and scrape pipeline",
		usage: `browse crawl <url> [options]

Crawl multiple pages starting from a URL, extracting data from each page.
Uses BFS traversal with configurable depth, rate limiting, and filtering.

Flags:
  --depth <N>              Max link-follow depth (default: 1)
  --extract <type>         Data to extract: text, links, table, meta (default: text)
  --paginate <selector>    CSS selector for pagination element (click to advance)
  --max-pages <N>          Maximum pages to visit (default: 100)
  --rate-limit <N/s>       Max requests per second (e.g., 2/s)
  --output <file>          Write JSON results to file
  --include <pattern>      Only crawl URLs matching glob pattern (repeatable)
  --exclude <pattern>      Skip URLs matching glob pattern (repeatable)
  --same-origin            Only follow links to the same origin
  --dry-run                Collect URLs without extracting data
  --json                   Output as JSON

Examples:
  browse crawl https://example.com
  browse crawl https://example.com --depth 2 --extract links --same-origin
  browse crawl https://example.com --paginate ".next-page" --max-pages 10
  browse crawl https://example.com --rate-limit 2/s --output results.json
  browse crawl https://example.com --include "*blog*" --exclude "*admin*"
  browse crawl https://example.com --depth 3 --dry-run`,
	},
	do: {
		summary: "Natural language browser automation via LLM",
		usage: `browse do "<instruction>" [--dry-run] [--provider <anthropic|openai>] [--model <model>] [--base-url <url>] [--verbose] [--env <name>]

Translates a natural language instruction into a sequence of browse commands
using an LLM, then returns the planned commands for execution.

Flags:
  --dry-run              Show planned commands without executing
  --provider <provider>  AI provider: anthropic (default), openai
  --model <model>        Model to use (default: claude-sonnet-4-20250514 for Anthropic, gpt-4o for OpenAI)
  --base-url <url>       Custom API base URL for OpenAI-compatible providers
  --verbose              Show additional details
  --env <name>           Environment name for login steps

Environment variables:
  ANTHROPIC_API_KEY      Required for Anthropic provider (default)
  OPENAI_API_KEY         Required for OpenAI provider

Examples:
  browse do "go to example.com and click the login button"
  browse do "fill in the search box with hello and press Enter" --dry-run
  browse do "log in and navigate to settings" --env staging
  browse do "take a screenshot of the homepage" --provider openai`,
	},
	vrt: {
		summary: "Visual regression testing workflow",
		usage: `browse vrt <init|baseline|check|update|list>

Subcommands:
  init                  Initialize VRT directory structure and config
  baseline [--url ...]  Capture baseline screenshots for configured pages
  check [--threshold N] Compare current screenshots against baselines
  update [--all]        Accept current screenshots as new baselines
  list                  List current baseline screenshots

Flags:
  --url <url>        URL to capture (repeatable, for baseline)
  --threshold <n>    Diff threshold percentage (default: from config, typically 5)
  --all              Update all baselines (for update)
  --only <names>     Update specific baselines (for update)
  --json             Output results as JSON (for check)

Configuration is stored in .browse/vrt/config.json.

Examples:
  browse vrt init
  browse vrt baseline --url https://example.com
  browse vrt check --threshold 3
  browse vrt update --all
  browse vrt list`,
	},
	"ci-init": {
		summary: "Scaffold CI/CD configuration for browse",
		usage: `browse ci-init [--ci <github|gitlab|circleci>] [--force]

Generates CI configuration files for running browse in your CI/CD pipeline.

Flags:
  --ci <system>   CI system: github, gitlab, circleci (auto-detected if omitted)
  --force         Overwrite existing config files`,
	},
	watch: {
		summary: "Watch a flow file and re-run on changes",
		usage: `browse watch <flow-file.json> [--var key=value]

Watches a flow file for changes and re-runs it automatically.`,
	},
	repl: {
		summary: "Start an interactive REPL session",
		usage: `browse repl [url]

Interactive session with command history, tab completion, and auto-snapshot.

REPL commands:
  .save <path>        Export history as a flow file
  .history            Show command history
  .undo               Navigate back
  .auto-snapshot      Toggle auto-snapshot
  exit                Quit REPL`,
	},
	seo: {
		summary: "Run SEO audit on the current page",
		usage: `browse seo [url] [--check <categories>] [--score] [--json]

Audits: meta tags, headings, images, links, structured data, Open Graph.

Flags:
  --check <list>   Audit specific categories (meta,headings,images,links)
  --score          Include a numeric score
  --json           Output as JSON

Examples:
  browse seo
  browse seo https://example.com --json`,
	},
	subscribe: {
		summary: "Subscribe to real-time browser events",
		usage: `browse subscribe [--events <types>] [--level <level>] [--idle-timeout <s>]

Streams browser events as NDJSON.

Event types: navigation, console, network, dialog, download, error

Flags:
  --events <types>       Comma-separated event types (default: navigation,console,network)
  --level <level>        Filter console events by level
  --idle-timeout <s>     Stop after N seconds of silence (default: 60)`,
	},
	dev: {
		summary: "Manage dev server lifecycle",
		usage: `browse dev <start|stop|status> [--flow <name>]

Configure in browse.config.json:
  { "devServer": { "command": "npm run dev", "url": "http://localhost:3000" } }

Subcommands:
  start    Start the dev server and wait for readiness
  stop     Stop the dev server
  status   Check if dev server is running`,
	},
	compliance: {
		summary: "Run cookie consent and privacy compliance audit",
		usage: `browse compliance [url] [--standard <gdpr|ccpa|eprivacy>] [--json]

Checks: pre-consent cookies, consent banner, third-party trackers, privacy policy links.

Flags:
  --standard <std>   Compliance standard (default: gdpr)
  --json             Output as JSON

Examples:
  browse compliance https://example.com
  browse compliance --standard gdpr --json`,
	},
	"security-scan": {
		summary: "Run active security scans (XSS, CSRF, clickjacking)",
		usage: `browse security-scan [--checks <types>] [--verbose] [--json]

Active security testing: XSS probing, CSP analysis, clickjacking, form security.

Flags:
  --checks <types>   Comma-separated scan types: xss,redirect,clickjack,csp,forms
  --verbose          Show every payload tested
  --json             Output as JSON

Note: Only run against applications you have permission to test.`,
	},
	i18n: {
		summary: "Multi-locale testing and translation checks",
		usage: `browse i18n [subcommand] --locales <en,fr,de,...> [--url <url>] [--json]

Subcommands:
  check-keys --url <url> --pattern <regex>   Check for untranslated strings
  rtl-check --url <url> --locale <locale>    Verify RTL layout

Flags:
  --locales <list>     Comma-separated locale codes
  --url <url>          URL to test
  --pattern <regex>    Regex for untranslated keys (default: UPPER_SNAKE_CASE)
  --json               Output as JSON`,
	},
	"api-assert": {
		summary: "Assert on API request/response from the browser",
		usage: `browse api-assert <url-pattern> [--status <code>] [--timing "<Nms"] [--schema <path>] [--json]

Waits for a matching network request and validates assertions.

Flags:
  --status <code>            Expected HTTP status code
  --method <method>          Match HTTP method
  --schema <path>            JSON Schema file for response validation
  --timing "<Nms"            Max response time
  --body-contains <string>   Response must contain string
  --max-size <size>          Max response size (e.g., 500kb)
  --header <name: value>     Expected response header
  --timeout <ms>             Wait timeout (default: 10000)

Examples:
  browse api-assert /api/users --status 200 --timing "<500ms"
  browse api-assert /api/submit --method POST --status 201`,
	},
	"design-audit": {
		summary: "Compare page styles against design tokens",
		usage: `browse design-audit --tokens <tokens.json> [--check colors,fonts] [--selector <sel>] [--json]
browse design-audit --extract [--json]

Flags:
  --tokens <path>      Design tokens JSON file
  --check <list>       Audit categories (colors, fonts)
  --selector <sel>     Scope to CSS selector
  --extract            Extract styles only (no comparison)
  --json               Output as JSON`,
	},
	"doc-capture": {
		summary: "Capture annotated screenshots for documentation",
		usage: `browse doc-capture --flow <flow.json> --output <dir> [--markdown <file>] [--update]

Flags:
  --flow <path>        Doc-capture flow file
  --output <dir>       Output directory for screenshots
  --markdown <file>    Generate markdown with image references
  --update             Only overwrite changed screenshots
  --var key=value      Pass variables to flow`,
	},
	gesture: {
		summary: "Perform touch gestures",
		usage: `browse gesture <type> [args]

Types:
  swipe <direction> [@ref]     Swipe left/right/up/down
  long-press <@ref>            Long press an element
  double-tap <@ref>            Double tap an element
  drag <@ref> --to <@ref>      Drag element to another

Flags:
  --speed <fast|slow>    Swipe speed
  --duration <ms>        Long press duration (default: 500)
  --distance <px>        Swipe distance (default: 200)`,
	},
	devices: {
		summary: "Browse and search device profiles",
		usage: `browse devices <subcommand>

Subcommands:
  list                  List all available device profiles
  search <query>        Search by name (e.g., "iphone")
  info <name>           Show device details

Use with --device flag:
  browse goto https://example.com --device "iPhone 15 Pro"`,
	},
	monitor: {
		summary: "Scheduled site monitoring with alerts",
		usage: `browse monitor <check|history|status> [--config monitor.json]

Subcommands:
  check                Run all site checks once
  history [--last 24h] View recent check history
  status               Show monitor configuration

Flags:
  --config <path>      Monitor config file (default: monitor.json)
  --last <duration>    Filter history (e.g., 24h, 7d)
  --site <name>        Filter by site name
  --json               Output as JSON`,
	},
};

export type PluginHelpEntry = {
	summary: string;
	usage: string;
};

export function formatOverview(
	pluginCommands?: Record<string, PluginHelpEntry>,
): string {
	const allCommands = { ...COMMANDS, ...pluginCommands };
	const lines = ["Usage: browse <command> [args...]", "", "Commands:"];

	// Find longest command name for alignment
	const builtinNames = Object.keys(COMMANDS);
	const maxLen = Math.max(...Object.keys(allCommands).map((c) => c.length));

	for (const name of builtinNames) {
		lines.push(`  ${name.padEnd(maxLen + 2)}${COMMANDS[name].summary}`);
	}

	if (pluginCommands && Object.keys(pluginCommands).length > 0) {
		lines.push("", "Plugin commands:");
		for (const [name, { summary }] of Object.entries(pluginCommands)) {
			lines.push(`  ${name.padEnd(maxLen + 2)}${summary}`);
		}
	}

	lines.push(
		"",
		"Global flags:",
		"  --timeout <ms>       Set command timeout",
		"  --session <name>     Route command to a named session",
		"  --json               Request JSON output (where supported)",
		"  --config <path>      Path to browse.config.json (default: search upward from cwd, then ~/.browse/config.json)",
		"",
		"Daemon flags:",
		"  --browser <name>     Browser engine: chrome (default), firefox, webkit",
		"  --proxy <url>        Route browser traffic through a proxy (e.g. http://proxy:8080, socks5://proxy:1080)",
		"  --listen <addr>      Also listen on TCP (e.g. tcp://0.0.0.0:9222) for remote agent access",
		"",
		"Environment variables:",
		"  BROWSE_HEADED=1      Launch browser in headed (visible) mode",
		"  BROWSE_BROWSER=name  Browser engine: chrome (default), firefox, webkit",
		"  BROWSE_PROXY=url     Route browser traffic through a proxy",
		"",
		'Run "browse help <command>" for detailed usage of a specific command.',
	);

	return lines.join("\n");
}

export function formatCommandHelp(
	cmd: string,
	pluginCommands?: Record<string, PluginHelpEntry>,
): string | null {
	const entry = COMMANDS[cmd] ?? pluginCommands?.[cmd];
	if (!entry) return null;

	return `${entry.summary}\n\nUsage:\n  ${entry.usage}`;
}
