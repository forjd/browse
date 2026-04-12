import { describe, expect, test } from "bun:test";
import {
	buildCucumberCommand,
	extractScenarioNames,
} from "../src/gherkin-runner.ts";

describe("gherkin runner", () => {
	test("builds cucumber-js command", () => {
		expect(buildCucumberCommand("features/login.feature")).toEqual([
			"cucumber-js",
			"features/login.feature",
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
