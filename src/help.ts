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
browse flow <name> [--var k=v ...] [--continue-on-error] [--reporter junit]

Flags:
  --var key=value       Pass variables to flow (repeatable)
  --continue-on-error   Continue running steps even if one fails
  --reporter <format>   Output format: junit (JUnit XML for CI integration)

Flows are defined in browse.config.json.`,
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
		usage: `browse healthcheck [--var k=v ...] [--no-screenshots] [--reporter junit]

Flags:
  --var key=value       Pass variables for URL interpolation (repeatable)
  --no-screenshots      Skip screenshot capture
  --reporter <format>   Output format: junit (JUnit XML for CI integration)

Pages are defined in browse.config.json.`,
	},
	wipe: {
		summary: "Clear all session data",
		usage:
			"browse wipe\n\nClears cookies, localStorage, sessionStorage, tabs, and buffers without stopping the daemon.",
	},
	benchmark: {
		summary: "Measure command latency",
		usage: `browse benchmark [--iterations N]

Flags:
  --iterations N   Number of iterations (default: 10)`,
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
	quit: {
		summary: "Shut down the daemon",
		usage: "browse quit",
	},
	version: {
		summary: "Print version and platform info",
		usage: "browse version",
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
		summary: "Show daemon status and uptime",
		usage:
			"browse status\n\nShows current URL, session count, uptime, and tab counts per session.",
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
		summary: "Wait for and save file downloads",
		usage: `browse download wait [--save-to <path>] [--timeout <ms>]

Flags:
  --save-to <path>   Save downloaded file to this path
  --timeout <ms>     Timeout for waiting (default: 30000)`,
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
};

export function formatOverview(): string {
	const lines = ["Usage: browse <command> [args...]", "", "Commands:"];

	// Find longest command name for alignment
	const maxLen = Math.max(...Object.keys(COMMANDS).map((c) => c.length));

	for (const [name, { summary }] of Object.entries(COMMANDS)) {
		lines.push(`  ${name.padEnd(maxLen + 2)}${summary}`);
	}

	lines.push(
		"",
		"Global flags:",
		"  --timeout <ms>       Set command timeout",
		"  --session <name>     Route command to a named session",
		"  --json               Request JSON output (where supported)",
		"  --config <path>      Path to browse.config.json (default: search upward from cwd, then ~/.browse/config.json)",
		"",
		"Environment variables:",
		"  BROWSE_HEADED=1      Launch browser in headed (visible) mode",
		"",
		'Run "browse help <command>" for detailed usage of a specific command.',
	);

	return lines.join("\n");
}

export function formatCommandHelp(cmd: string): string | null {
	const entry = COMMANDS[cmd];
	if (!entry) return null;

	return `${entry.summary}\n\nUsage:\n  ${entry.usage}`;
}
