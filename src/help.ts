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
		usage: `browse snapshot [-i] [-f]

Flags:
  -i    Include structural nodes with names (inclusive mode)
  -f    Include all nodes in tree (full mode)

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
		usage: `browse screenshot [path] [--viewport] [--selector <css-selector>]

Flags:
  --viewport              Screenshot only the viewport (not full page)
  --selector <selector>   Screenshot only the element matching the selector

If no path is given, saves to ~/.bun-browse/screenshots/ with a timestamp.`,
	},
	console: {
		summary: "Show console messages",
		usage: `browse console [--level <level>] [--keep]

Flags:
  --level <level>   Filter by level: log, info, warning, error, debug
  --keep            Peek at messages without draining buffer`,
	},
	network: {
		summary: "Show network requests",
		usage: `browse network [--all] [--keep]

Flags:
  --all    Show all requests (default: status >= 400 only)
  --keep   Peek at requests without draining buffer`,
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
browse flow <name> [--var k=v ...] [--continue-on-error]

Flags:
  --var key=value       Pass variables to flow (repeatable)
  --continue-on-error   Continue running steps even if one fails

Flows are defined in browse.config.json.`,
	},
	assert: {
		summary: "Assert a condition (PASS/FAIL)",
		usage: `browse assert <type> <args...>

Types:
  visible <selector>              Element is visible
  not-visible <selector>          Element is not visible
  text-contains <text>            Page contains text
  text-not-contains <text>        Page does not contain text
  url-contains <substring>        URL contains substring
  url-pattern <regex>             URL matches regex
  element-text <selector> <text>  Element text contains value
  element-count <selector> <n>    Element count matches
  permission <name> granted|denied [--var k=v ...]`,
	},
	healthcheck: {
		summary: "Run healthcheck across configured pages",
		usage: `browse healthcheck [--var k=v ...] [--no-screenshots]

Flags:
  --var key=value     Pass variables for URL interpolation (repeatable)
  --no-screenshots    Skip screenshot capture

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
browse wait visible <selector>     Wait until element is visible
browse wait hidden <selector>      Wait until element disappears
browse wait network-idle           Wait until no pending network requests
browse wait <ms>                   Wait for a fixed delay (last resort)

Respects --timeout flag. Polls at 100ms intervals.`,
	},
	quit: {
		summary: "Shut down the daemon",
		usage: "browse quit",
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
		'Run "browse help <command>" for detailed usage of a specific command.',
	);

	return lines.join("\n");
}

export function formatCommandHelp(cmd: string): string | null {
	const entry = COMMANDS[cmd];
	if (!entry) return null;

	return `${entry.summary}\n\nUsage:\n  ${entry.usage}`;
}
