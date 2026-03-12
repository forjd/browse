import { describe, expect, test } from "bun:test";
import { formatOutput, parseArgs } from "../src/cli.ts";

describe("parseArgs", () => {
	test("parses goto command with URL", () => {
		const result = parseArgs(["goto", "https://example.com"]);
		expect(result).toEqual({ cmd: "goto", args: ["https://example.com"] });
	});

	test("parses text command with no args", () => {
		const result = parseArgs(["text"]);
		expect(result).toEqual({ cmd: "text", args: [] });
	});

	test("parses quit command", () => {
		const result = parseArgs(["quit"]);
		expect(result).toEqual({ cmd: "quit", args: [] });
	});

	test("returns null for empty args", () => {
		const result = parseArgs([]);
		expect(result).toBeNull();
	});

	test("detects --daemon flag", () => {
		const result = parseArgs(["--daemon"]);
		expect(result).toEqual({ daemon: true });
	});

	test("passes through unknown commands (server validates)", () => {
		const result = parseArgs(["unknown"]);
		expect(result).toEqual({ cmd: "unknown", args: [] });
	});
});

describe("formatOutput", () => {
	test("returns data string for success responses", () => {
		const result = formatOutput({ ok: true, data: "Example Domain" });
		expect(result).toEqual({ output: "Example Domain", isError: false });
	});

	test("returns error string for error responses", () => {
		const result = formatOutput({ ok: false, error: "Something went wrong" });
		expect(result).toEqual({
			output: "Error: Something went wrong",
			isError: true,
		});
	});
});
