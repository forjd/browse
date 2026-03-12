import { describe, expect, test } from "bun:test";
import {
	DEFAULT_TIMEOUT_MS,
	resolveTimeout,
	withTimeout,
} from "../../src/timeout.ts";

describe("withTimeout", () => {
	test("returns result when operation completes within timeout", async () => {
		const result = await withTimeout(() => Promise.resolve("done"), 1000);
		expect(result).toBe("done");
	});

	test("throws timeout error when operation exceeds timeout", async () => {
		const slow = () =>
			new Promise<string>((resolve) => setTimeout(() => resolve("late"), 5000));

		await expect(withTimeout(slow, 50)).rejects.toThrow(
			"Command timed out after 50ms",
		);
	});

	test("includes timeout value in error message", async () => {
		const slow = () => new Promise<never>(() => {});

		try {
			await withTimeout(slow, 123);
			expect.unreachable("should have thrown");
		} catch (err) {
			expect((err as Error).message).toBe("Command timed out after 123ms");
		}
	});

	test("timeout of 0 uses default timeout", async () => {
		// Should not hang — 0 is treated as default, not infinite
		const result = await withTimeout(() => Promise.resolve("ok"), 0);
		expect(result).toBe("ok");
	});
});

describe("resolveTimeout", () => {
	test("returns CLI timeout when provided", () => {
		expect(resolveTimeout(5000, 10000)).toBe(5000);
	});

	test("returns config timeout when no CLI timeout", () => {
		expect(resolveTimeout(undefined, 10000)).toBe(10000);
	});

	test("returns default when neither CLI nor config timeout", () => {
		expect(resolveTimeout(undefined, undefined)).toBe(DEFAULT_TIMEOUT_MS);
	});

	test("CLI timeout overrides config timeout", () => {
		expect(resolveTimeout(3000, 60000)).toBe(3000);
	});

	test("treats 0 CLI timeout as unset (falls through to config)", () => {
		expect(resolveTimeout(0, 10000)).toBe(10000);
	});

	test("treats 0 config timeout as unset (falls through to default)", () => {
		expect(resolveTimeout(undefined, 0)).toBe(DEFAULT_TIMEOUT_MS);
	});
});
