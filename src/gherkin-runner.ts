const SCENARIO_RE = /^\s*Scenario(?: Outline)?:\s*(.+)$/gm;

export type CucumberCommandOptions = {
	config?: string;
	profile?: string;
	require?: string[];
	format?: string;
	tags?: string;
};

/**
 * A single argv element of a browse command. Strings are literals; `{ param }`
 * references a captured Cucumber expression parameter by name.
 */
export type StepCommandPart = string | { param: string };

export type GherkinStepDefinition = {
	keyword: "Given" | "When" | "Then";
	/** Cucumber expression, e.g. `I open {string}`. */
	expression: string;
	/** Parameter names in capture order. One per `{...}` in the expression. */
	params: string[];
	/** The browse argv this step runs. */
	command: StepCommandPart[];
	/** Comment rendered above the generated step definition. */
	description: string;
};

/**
 * The step-definition layer. This table is the single source of truth: both the
 * generated step definition file and `resolveStepCommand` derive from it, so
 * scaffolded JavaScript cannot drift from the tested argv mapping.
 */
export const GHERKIN_STEP_DEFINITIONS: GherkinStepDefinition[] = [
	{
		keyword: "Given",
		expression: "browse is ready",
		params: [],
		command: ["ping"],
		description: "Start (or reuse) the Browse daemon.",
	},
	{
		keyword: "Given",
		expression: "a clean browser session",
		params: [],
		command: ["wipe"],
		description: "Clear cookies, storage, tabs, and buffers.",
	},
	{
		keyword: "When",
		expression: "I open {string}",
		params: ["url"],
		command: ["goto", { param: "url" }],
		description: "Navigate to a URL.",
	},
	{
		keyword: "When",
		expression: "I take a snapshot",
		params: [],
		command: ["snapshot"],
		description: "Refresh element refs so later steps can use @ref handles.",
	},
	{
		keyword: "When",
		expression: "I click {string}",
		params: ["ref"],
		command: ["click", { param: "ref" }],
		description: "Click an element by @ref (see `browse snapshot`).",
	},
	{
		keyword: "When",
		expression: "I fill {string} with {string}",
		params: ["ref", "value"],
		command: ["fill", { param: "ref" }, { param: "value" }],
		description: "Fill a text input by @ref.",
	},
	{
		keyword: "When",
		expression: "I select {string} in {string}",
		params: ["option", "ref"],
		command: ["select", { param: "ref" }, { param: "option" }],
		description: "Choose a dropdown option by @ref.",
	},
	{
		keyword: "When",
		expression: "I press {string}",
		params: ["key"],
		command: ["press", { param: "key" }],
		description: "Send a keypress, e.g. Enter or Control+a.",
	},
	{
		keyword: "When",
		expression: "I wait for {string} to be visible",
		params: ["selector"],
		command: ["wait", "visible", { param: "selector" }],
		description: "Wait until a selector or @ref becomes visible.",
	},
	{
		keyword: "When",
		expression: "I wait until the page contains {string}",
		params: ["text"],
		command: ["wait", "text", { param: "text" }],
		description: "Wait until page text contains a string.",
	},
	{
		keyword: "Then",
		expression: "the page should contain {string}",
		params: ["text"],
		command: ["assert", "text-contains", { param: "text" }],
		description: "Assert visible page text contains a string.",
	},
	{
		keyword: "Then",
		expression: "the page should not contain {string}",
		params: ["text"],
		command: ["assert", "text-not-contains", { param: "text" }],
		description: "Assert visible page text does not contain a string.",
	},
	{
		keyword: "Then",
		expression: "{string} should be visible",
		params: ["selector"],
		command: ["assert", "visible", { param: "selector" }],
		description: "Assert a selector or @ref is visible.",
	},
	{
		keyword: "Then",
		expression: "{string} should not be visible",
		params: ["selector"],
		command: ["assert", "not-visible", { param: "selector" }],
		description: "Assert a selector or @ref is absent or hidden.",
	},
	{
		keyword: "Then",
		expression: "the URL should contain {string}",
		params: ["substring"],
		command: ["assert", "url-contains", { param: "substring" }],
		description: "Assert the current URL contains a substring.",
	},
	{
		keyword: "Then",
		expression: "the URL should match {string}",
		params: ["pattern"],
		command: ["assert", "url-pattern", { param: "pattern" }],
		description: "Assert the current URL matches a regular expression.",
	},
	{
		keyword: "Then",
		expression: "I save a screenshot to {string}",
		params: ["path"],
		command: ["screenshot", { param: "path" }],
		description: "Capture a screenshot for the Cucumber report.",
	},
];

export function buildCucumberCommand(
	featurePath?: string,
	options: CucumberCommandOptions = {},
): string[] {
	return [
		"cucumber-js",
		...(options.config ? ["--config", options.config] : []),
		...(options.profile ? ["--profile", options.profile] : []),
		...(featurePath ? [featurePath] : []),
		...(options.require?.flatMap((path) => ["--require", path]) ?? []),
		...(options.format ? ["--format", options.format] : []),
		...(options.tags ? ["--tags", options.tags] : []),
	];
}

export function extractScenarioNames(featureText: string): string[] {
	const matches = featureText.matchAll(SCENARIO_RE);
	return [...matches].map((m) => m[1].trim());
}

/**
 * Resolve a step definition plus its captured Cucumber parameters into the
 * browse argv to execute.
 */
export function resolveStepCommand(
	definition: GherkinStepDefinition,
	values: string[] = [],
): string[] {
	if (values.length !== definition.params.length) {
		throw new Error(
			`Step '${definition.expression}' expects ${definition.params.length} argument(s), received ${values.length}.`,
		);
	}

	return definition.command.map((part) => {
		if (typeof part === "string") {
			return part;
		}

		const value = values[definition.params.indexOf(part.param)];
		if (value === undefined) {
			throw new Error(
				`Step '${definition.expression}' references unknown parameter '${part.param}'.`,
			);
		}
		return value;
	});
}

export function findStepDefinition(
	expression: string,
): GherkinStepDefinition | undefined {
	return GHERKIN_STEP_DEFINITIONS.find(
		(definition) => definition.expression === expression,
	);
}

function renderStepCommand(definition: GherkinStepDefinition): string {
	const parts = definition.command.map((part) =>
		typeof part === "string" ? JSON.stringify(part) : part.param,
	);
	return `[${parts.join(", ")}]`;
}

function renderStepDefinition(definition: GherkinStepDefinition): string {
	return `// ${definition.description}
${definition.keyword}(${JSON.stringify(definition.expression)}, async function (${definition.params.join(", ")}) {
	await this.browse.run(${renderStepCommand(definition)});
});`;
}

/**
 * Cucumber's default step timeout is 5s, which a cold `browse` daemon start
 * regularly exceeds. Generated step files raise it so a fresh scaffold passes.
 */
export const DEFAULT_STEP_TIMEOUT_MS = 60_000;

export function buildStepDefinitionsTemplate(harnessModule: string): string {
	const keywords = [
		...new Set(GHERKIN_STEP_DEFINITIONS.map((step) => step.keyword)),
	];

	return `// Generated by \`browse framework init cucumber\`.
//
// These steps shell out to the Browse CLI, so the Cucumber runner stays in
// charge of Gherkin parsing, tags, hooks, and reporting. Add project-specific
// steps below the generated block.
const {
	${keywords.join(",\n\t")},
	After,
	Before,
	setDefaultTimeout,
	setWorldConstructor,
} = require("@cucumber/cucumber");
const { createBrowseHarness } = require("${harnessModule}");

// A cold daemon start takes longer than Cucumber's 5s default.
setDefaultTimeout(${DEFAULT_STEP_TIMEOUT_MS});

class BrowseWorld {
	constructor() {
		this.browse = createBrowseHarness();
	}
}

setWorldConstructor(BrowseWorld);

Before(async function () {
	await this.browse.run(["ping"]);
});

After(async function () {
	// Leave the daemon running between scenarios; \`browse quit\` in a global
	// teardown if you want a cold start per run.
});

${GHERKIN_STEP_DEFINITIONS.map(renderStepDefinition).join("\n\n")}
`;
}

/**
 * Tag on the intentionally-failing starter scenario. The generated config's
 * default profile excludes it so a fresh scaffold is green, and the
 * `failing` profile runs only that scenario so you can check how a red run
 * reports.
 */
export const FAILING_EXAMPLE_TAG = "@failing-example";

/** Cucumber profile in the generated config that runs only the failing example. */
export const FAILING_EXAMPLE_PROFILE = "failing";

export function buildFeatureTemplate(): string {
	return `Feature: Browse smoke test
  As a QA engineer
  I want to drive Browse from Gherkin
  So that non-engineers can read the test suite

  Background:
    Given browse is ready

  Scenario: The example homepage loads
    When I open "https://example.com"
    Then the page should contain "Example Domain"
    And the URL should contain "example.com"

  # Excluded from the default profile. Run the '${FAILING_EXAMPLE_PROFILE}' profile
  # to see how a red run reports.
  ${FAILING_EXAMPLE_TAG}
  Scenario: A missing string fails the run
    When I open "https://example.com"
    Then the page should contain "This text is not on the page"
`;
}

export function buildCucumberConfigTemplate(
	stepsGlob: string,
	featureGlob: string,
): string {
	return `const shared = {
	paths: [${JSON.stringify(featureGlob)}],
	require: [${JSON.stringify(stepsGlob)}],
	format: ["progress", "html:reports/cucumber.html"],
};

module.exports = {
	default: { ...shared, tags: "not ${FAILING_EXAMPLE_TAG}" },
	// Runs only the intentionally-failing starter scenario. Cucumber ANDs a
	// config 'tags' with a CLI --tags, so this needs its own profile rather
	// than a --tags override.
	${FAILING_EXAMPLE_PROFILE}: { ...shared, tags: "${FAILING_EXAMPLE_TAG}" },
};
`;
}
