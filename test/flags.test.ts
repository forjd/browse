import { describe, expect, test } from "bun:test";
import { checkUnknownFlags, unknownFlagsError } from "../src/flags.ts";

describe("checkUnknownFlags", () => {
	test("returns empty array when no flags present", () => {
		expect(checkUnknownFlags(["https://example.com"], [])).toEqual([]);
	});

	test("returns empty array when all flags are known", () => {
		expect(
			checkUnknownFlags(
				["--viewport", "--selector", ".foo"],
				["--viewport", "--selector"],
			),
		).toEqual([]);
	});

	test("detects unknown flags", () => {
		expect(checkUnknownFlags(["--device", "iPhone SE"], [])).toEqual([
			"--device",
		]);
	});

	test("detects multiple unknown flags", () => {
		expect(checkUnknownFlags(["--foo", "--bar", "value"], ["--bar"])).toEqual([
			"--foo",
		]);
	});

	test("ignores positional arguments", () => {
		expect(checkUnknownFlags(["https://example.com", "extra"], [])).toEqual([]);
	});

	test("ignores short flags (single dash)", () => {
		expect(checkUnknownFlags(["-i", "-f"], [])).toEqual([]);
	});

	test("handles --help as known (global flag)", () => {
		expect(checkUnknownFlags(["--help"], [])).toEqual([]);
	});
});

describe("unknownFlagsError", () => {
	test("formats single unknown flag", () => {
		const msg = unknownFlagsError("goto", ["--device"]);
		expect(msg).toBe(
			"Unknown flag for 'goto': --device. Run 'browse help goto' for usage.",
		);
	});

	test("formats multiple unknown flags", () => {
		const msg = unknownFlagsError("screenshot", ["--device", "--foo"]);
		expect(msg).toBe(
			"Unknown flags for 'screenshot': --device, --foo. Run 'browse help screenshot' for usage.",
		);
	});
});
