import { describe, expect, test } from "bun:test";
import { interpolateVars, parseVars } from "../src/flow-runner.ts";

describe("parseVars", () => {
	test("parses single --var flag", () => {
		const result = parseVars(["--var", "base_url=https://example.com"]);
		expect(result).toEqual({ base_url: "https://example.com" });
	});

	test("parses multiple --var flags", () => {
		const result = parseVars([
			"--var",
			"base_url=https://example.com",
			"--var",
			"email=test@test.com",
			"--var",
			"pass=secret",
		]);
		expect(result).toEqual({
			base_url: "https://example.com",
			email: "test@test.com",
			pass: "secret",
		});
	});

	test("splits on first = only (value may contain =)", () => {
		const result = parseVars(["--var", "query=a=b&c=d"]);
		expect(result).toEqual({ query: "a=b&c=d" });
	});

	test("handles empty value", () => {
		const result = parseVars(["--var", "empty="]);
		expect(result).toEqual({ empty: "" });
	});

	test("returns empty object with no --var flags", () => {
		const result = parseVars(["some", "other", "args"]);
		expect(result).toEqual({});
	});

	test("ignores --var without a value", () => {
		const result = parseVars(["--var"]);
		expect(result).toEqual({});
	});

	test("ignores --var with missing = in value", () => {
		const result = parseVars(["--var", "noequals"]);
		expect(result).toEqual({});
	});
});

describe("interpolateVars", () => {
	test("replaces {{key}} with value", () => {
		const result = interpolateVars("{{base_url}}/register", {
			base_url: "https://example.com",
		});
		expect(result).toBe("https://example.com/register");
	});

	test("replaces multiple occurrences", () => {
		const result = interpolateVars("{{a}} and {{b}} and {{a}}", {
			a: "X",
			b: "Y",
		});
		expect(result).toBe("X and Y and X");
	});

	test("leaves unmatched variables as literal", () => {
		const result = interpolateVars("{{known}} and {{unknown}}", {
			known: "OK",
		});
		expect(result).toBe("OK and {{unknown}}");
	});

	test("handles no variables in template", () => {
		const result = interpolateVars("plain text", { key: "val" });
		expect(result).toBe("plain text");
	});

	test("handles empty vars", () => {
		const result = interpolateVars("{{key}}", {});
		expect(result).toBe("{{key}}");
	});
});
