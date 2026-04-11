import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { parseRequest } from "../../src/protocol.ts";

describe("fuzz: protocol parser", () => {
	test("parseRequest handles arbitrary input safely", () => {
		fc.assert(
			fc.property(fc.string(), (input) => {
				try {
					const parsed = parseRequest(input);
					expect(typeof parsed.cmd).toBe("string");
					expect(Array.isArray(parsed.args)).toBe(true);
				} catch (err) {
					expect(err).toBeInstanceOf(Error);
				}
			}),
			{ numRuns: 1_000 },
		);
	});

	test("parseRequest handles random JSON objects safely", () => {
		fc.assert(
			fc.property(fc.jsonValue(), (value) => {
				const input = JSON.stringify(value);
				try {
					const parsed = parseRequest(input);
					expect(Array.isArray(parsed.args)).toBe(true);
				} catch (err) {
					expect(err).toBeInstanceOf(Error);
				}
			}),
			{ numRuns: 1_000 },
		);
	});
});
