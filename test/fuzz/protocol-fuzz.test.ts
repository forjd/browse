import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { parseRequest } from "../../src/protocol.ts";

describe("fuzz: protocol parser", () => {
	test("parseRequest handles arbitrary input safely", () => {
		fc.assert(
			fc.property(fc.string(), (input) => {
				let parsed: ReturnType<typeof parseRequest>;
				try {
					parsed = parseRequest(input);
				} catch (err) {
					expect(err).toBeInstanceOf(Error);
					return;
				}
				expect(typeof parsed.cmd).toBe("string");
				expect(Array.isArray(parsed.args)).toBe(true);
			}),
			{ numRuns: 1_000 },
		);
	});

	test("parseRequest handles random JSON objects safely", () => {
		fc.assert(
			fc.property(fc.jsonValue(), (value) => {
				const input = JSON.stringify(value);
				let parsed: ReturnType<typeof parseRequest>;
				try {
					parsed = parseRequest(input);
				} catch (err) {
					expect(err).toBeInstanceOf(Error);
					return;
				}
				expect(Array.isArray(parsed.args)).toBe(true);
			}),
			{ numRuns: 1_000 },
		);
	});
});
