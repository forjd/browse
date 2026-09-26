import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	buildCucumberCommand,
	buildCucumberConfigTemplate,
	buildFeatureTemplate,
	buildStepDefinitionsTemplate,
	extractScenarioNames,
	FAILING_EXAMPLE_TAG,
	findStepDefinition,
	GHERKIN_STEP_DEFINITIONS,
	resolveStepCommand,
} from "../src/gherkin-runner.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-gherkin-runner");

function step(expression: string) {
	const definition = findStepDefinition(expression);
	if (!definition) {
		throw new Error(`Missing step definition: ${expression}`);
	}
	return definition;
}

describe("gherkin runner", () => {
	test("builds cucumber-js command", () => {
		expect(buildCucumberCommand("features/login.feature")).toEqual([
			"cucumber-js",
			"features/login.feature",
		]);
	});

	test("builds cucumber-js command with config, require, format, and tags", () => {
		expect(
			buildCucumberCommand("features/login.feature", {
				config: "tests/cucumber.cjs",
				require: ["tests/step-definitions"],
				format: "json:reports/cucumber.json",
				tags: FAILING_EXAMPLE_TAG,
			}),
		).toEqual([
			"cucumber-js",
			"--config",
			"tests/cucumber.cjs",
			"features/login.feature",
			"--require",
			"tests/step-definitions",
			"--format",
			"json:reports/cucumber.json",
			"--tags",
			"@failing-example",
		]);
	});

	test("extracts scenario names from feature file text", () => {
		const names = extractScenarioNames(`
Feature: Login
  Scenario: Successful login
    Given a user exists
  Scenario Outline: Failed login
    Given credentials are wrong
`);
		expect(names).toEqual(["Successful login", "Failed login"]);
	});
});

describe("gherkin step definitions", () => {
	test("maps navigation and assertion steps to browse argv", () => {
		expect(resolveStepCommand(step("browse is ready"))).toEqual(["ping"]);
		expect(
			resolveStepCommand(step("I open {string}"), ["https://example.com"]),
		).toEqual(["goto", "https://example.com"]);
		expect(
			resolveStepCommand(step("the page should contain {string}"), [
				"Example Domain",
			]),
		).toEqual(["assert", "text-contains", "Example Domain"]);
		expect(
			resolveStepCommand(step("the URL should contain {string}"), [
				"example.com",
			]),
		).toEqual(["assert", "url-contains", "example.com"]);
		expect(
			resolveStepCommand(step("I wait for {string} to be visible"), [
				"#results",
			]),
		).toEqual(["wait", "visible", "#results"]);
	});

	test("substitutes parameters by name, not position", () => {
		// The Gherkin phrasing puts the option before the ref, while `browse
		// select` takes the ref first.
		expect(
			resolveStepCommand(step("I select {string} in {string}"), [
				"Bristol",
				"@e12",
			]),
		).toEqual(["select", "@e12", "Bristol"]);
		expect(
			resolveStepCommand(step("I fill {string} with {string}"), [
				"@e3",
				"hunter2",
			]),
		).toEqual(["fill", "@e3", "hunter2"]);
	});

	test("rejects the wrong number of captured arguments", () => {
		expect(() => resolveStepCommand(step("I open {string}"), [])).toThrow(
			"expects 1 argument(s), received 0",
		);
	});

	test("declares one parameter per capture group", () => {
		for (const definition of GHERKIN_STEP_DEFINITIONS) {
			const captures = definition.expression.match(/\{[a-z]+\}/g) ?? [];
			expect(definition.params).toHaveLength(captures.length);
			expect(new Set(definition.params).size).toBe(definition.params.length);
		}
	});

	test("every step resolves without unknown parameter references", () => {
		for (const definition of GHERKIN_STEP_DEFINITIONS) {
			const values = definition.params.map((_, index) => `value${index}`);
			expect(() => resolveStepCommand(definition, values)).not.toThrow();
		}
	});
});

describe("gherkin templates", () => {
	test("feature template has a passing scenario and a tagged failing one", () => {
		const feature = buildFeatureTemplate();
		expect(extractScenarioNames(feature)).toEqual([
			"The example homepage loads",
			"A missing string fails the run",
		]);
		expect(feature).toContain(FAILING_EXAMPLE_TAG);
	});

	test("feature template only uses generated step phrasings", () => {
		const feature = buildFeatureTemplate();
		const stepLines = feature
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => /^(Given|When|Then|And) /.test(line));

		expect(stepLines.length).toBeGreaterThan(0);

		for (const line of stepLines) {
			const text = line.replace(/^(Given|When|Then|And) /, "");
			const matched = GHERKIN_STEP_DEFINITIONS.some((definition) => {
				const pattern = definition.expression
					.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
					.replace(/\\\{string\\\}/g, '"[^"]*"');
				return new RegExp(`^${pattern}$`).test(text);
			});
			expect(matched).toBe(true);
		}
	});

	test("config template excludes the failing example by default", () => {
		const config = buildCucumberConfigTemplate(
			"tests/step-definitions",
			"tests/features",
		);
		expect(config).toContain('paths: ["tests/features"]');
		expect(config).toContain('require: ["tests/step-definitions"]');
		expect(config).toContain(`tags: "not ${FAILING_EXAMPLE_TAG}"`);
	});

	test("step definitions template registers every step against a real Cucumber API", () => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		const stubDir = join(TEST_DIR, "node_modules", "@cucumber", "cucumber");
		mkdirSync(stubDir, { recursive: true });
		writeFileSync(
			join(stubDir, "package.json"),
			JSON.stringify({ name: "@cucumber/cucumber", main: "index.cjs" }),
		);
		// Records registrations so we can assert on expressions and arity the
		// way cucumber-js validates them.
		writeFileSync(
			join(stubDir, "index.cjs"),
			`const registered = [];
const hooks = [];
function record(keyword) {
	return (expression, fn) => registered.push({ keyword, expression, arity: fn.length, fn });
}
module.exports = {
	registered,
	hooks,
	Given: record("Given"),
	When: record("When"),
	Then: record("Then"),
	Before: (fn) => hooks.push({ keyword: "Before", fn }),
	After: (fn) => hooks.push({ keyword: "After", fn }),
	setWorldConstructor: (ctor) => { module.exports.world = ctor; },
};
`,
		);
		writeFileSync(
			join(TEST_DIR, "browse-harness.cjs"),
			"module.exports = { createBrowseHarness: () => ({ calls: [], run(args) { this.calls.push(args); return Promise.resolve({ code: 0, stdout: '', stderr: '' }); } }) };\n",
		);
		writeFileSync(
			join(TEST_DIR, "browse.steps.cjs"),
			buildStepDefinitionsTemplate("./browse-harness.cjs"),
		);

		const cucumber = require(join(stubDir, "index.cjs"));
		require(join(TEST_DIR, "browse.steps.cjs"));

		expect(cucumber.registered).toHaveLength(GHERKIN_STEP_DEFINITIONS.length);
		expect(
			cucumber.hooks.map((hook: { keyword: string }) => hook.keyword),
		).toEqual(["Before", "After"]);

		for (const definition of GHERKIN_STEP_DEFINITIONS) {
			const entry = cucumber.registered.find(
				(candidate: { expression: string }) =>
					candidate.expression === definition.expression,
			);
			expect(entry).toBeDefined();
			expect(entry.keyword).toBe(definition.keyword);
			// cucumber-js rejects step functions whose arity does not match the
			// number of captured parameters.
			expect(entry.arity).toBe(definition.params.length);
		}

		// Invoke one step against a fake world and check the argv it shells out.
		const world = new cucumber.world();
		const openStep = cucumber.registered.find(
			(candidate: { expression: string }) =>
				candidate.expression === "I open {string}",
		);
		return openStep.fn.call(world, "https://example.com").then(() => {
			expect(world.browse.calls).toEqual([["goto", "https://example.com"]]);
			rmSync(TEST_DIR, { recursive: true, force: true });
		});
	});
});
