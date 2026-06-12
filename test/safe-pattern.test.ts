import { describe, expect, test } from "bun:test";
import {
	compileSafePattern,
	hasNestedUnboundedQuantifier,
} from "../src/safe-pattern.ts";

describe("hasNestedUnboundedQuantifier", () => {
	test("detects nested unbounded quantifiers", () => {
		expect(hasNestedUnboundedQuantifier("(a+)+$")).toBe(true);
		expect(hasNestedUnboundedQuantifier("^(.*)+$")).toBe(true);
		expect(hasNestedUnboundedQuantifier("^(?:\\w+\\s*)+$")).toBe(true);
	});

	test("ignores escaped quantifier literals", () => {
		expect(hasNestedUnboundedQuantifier("(a\\+)+$")).toBe(false);
	});

	test("allows bounded inner quantifiers", () => {
		expect(hasNestedUnboundedQuantifier("(a{1,3})+$")).toBe(false);
	});
});

describe("compileSafePattern", () => {
	test("compiles ordinary patterns", () => {
		expect(compileSafePattern("foo.*bar").test("fooXbar")).toBe(true);
		expect(compileSafePattern("^/dashboard").test("/dashboard")).toBe(true);
		expect(compileSafePattern("\\d{2,4}").test("123")).toBe(true);
	});

	test("compiles ordinary URL patterns", () => {
		const pattern = compileSafePattern("^https://.*/(dashboard|home)$");
		expect(pattern.test("https://example.com/dashboard")).toBe(true);
		expect(pattern.test("https://example.com/settings")).toBe(false);
	});

	test("allows sibling non-nested quantifiers", () => {
		expect(() => compileSafePattern("a*b+c?")).not.toThrow();
		expect(() => compileSafePattern("(a*)(b+)")).not.toThrow();
		expect(() => compileSafePattern("(abc)+def")).not.toThrow();
	});

	test("allows quantifiers inside character classes", () => {
		expect(() => compileSafePattern("([*+])+")).not.toThrow();
	});

	test("rejects overly long patterns", () => {
		expect(() => compileSafePattern("a".repeat(2000))).toThrow(
			/maximum length/,
		);
		expect(() => compileSafePattern("a".repeat(1025))).toThrow(
			/maximum length/,
		);
	});

	test("rejects invalid patterns", () => {
		expect(() => compileSafePattern("(unclosed")).toThrow(/Invalid regex/);
		expect(() => compileSafePattern("[")).toThrow(/Invalid regex/);
	});

	test("rejects nested unbounded quantifiers", () => {
		expect(() => compileSafePattern("(a+)*")).toThrow(/nested/);
		expect(() => compileSafePattern("(a*)+")).toThrow(/nested/);
		expect(() => compileSafePattern("(\\d+)+$")).toThrow(/nested/);
		expect(() => compileSafePattern("((ab)+)*")).toThrow(/nested/);
		expect(() => compileSafePattern("(a{1,})*")).toThrow(/nested/);
		expect(() => compileSafePattern("(x(a+))+")).toThrow(/nested/);
		expect(() => compileSafePattern("(a+)+$")).toThrow(/nested/);
	});
});
