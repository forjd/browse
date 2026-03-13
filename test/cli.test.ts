import { describe, expect, test } from "bun:test";
import { formatOutput, parseArgs } from "../src/cli.ts";

describe("parseArgs", () => {
	test("parses goto command with URL", () => {
		const result = parseArgs(["goto", "https://example.com"]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["https://example.com"],
			timeout: undefined,
		});
	});

	test("parses text command with no args", () => {
		const result = parseArgs(["text"]);
		expect(result).toEqual({ cmd: "text", args: [], timeout: undefined });
	});

	test("parses quit command", () => {
		const result = parseArgs(["quit"]);
		expect(result).toEqual({ cmd: "quit", args: [], timeout: undefined });
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
		expect(result).toEqual({ cmd: "unknown", args: [], timeout: undefined });
	});

	test("parses help with no args", () => {
		const result = parseArgs(["help"]);
		expect(result).toEqual({ cmd: "help", args: [], timeout: undefined });
	});

	test("parses help with command arg", () => {
		const result = parseArgs(["help", "goto"]);
		expect(result).toEqual({ cmd: "help", args: ["goto"], timeout: undefined });
	});

	test("parses --help flag", () => {
		const result = parseArgs(["--help"]);
		expect(result).toEqual({ cmd: "--help", args: [], timeout: undefined });
	});

	test("parses -h flag", () => {
		const result = parseArgs(["-h"]);
		expect(result).toEqual({ cmd: "-h", args: [], timeout: undefined });
	});

	test("parses command with --help flag (interception is in runCli)", () => {
		const result = parseArgs(["goto", "--help"]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["--help"],
			timeout: undefined,
		});
	});

	test("extracts --timeout flag from args", () => {
		const result = parseArgs([
			"goto",
			"https://example.com",
			"--timeout",
			"60000",
		]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["https://example.com"],
			timeout: 60000,
		});
	});

	test("--timeout flag is removed from args", () => {
		const result = parseArgs([
			"goto",
			"https://example.com",
			"--timeout",
			"5000",
		]);
		if (result && "args" in result) {
			expect(result.args).not.toContain("--timeout");
			expect(result.args).not.toContain("5000");
		}
	});

	test("invalid --timeout value is ignored", () => {
		const result = parseArgs([
			"goto",
			"https://example.com",
			"--timeout",
			"abc",
		]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["https://example.com"],
			timeout: undefined,
		});
	});

	test("negative --timeout value is ignored", () => {
		const result = parseArgs([
			"goto",
			"https://example.com",
			"--timeout",
			"-5",
		]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["https://example.com"],
			timeout: undefined,
		});
	});

	test("zero --timeout value is ignored", () => {
		const result = parseArgs(["goto", "https://example.com", "--timeout", "0"]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["https://example.com"],
			timeout: undefined,
		});
	});

	test("--timeout at end without value is treated as regular arg", () => {
		const result = parseArgs(["goto", "https://example.com", "--timeout"]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["https://example.com", "--timeout"],
			timeout: undefined,
		});
	});

	test("--timeout in middle of args", () => {
		const result = parseArgs([
			"screenshot",
			"--timeout",
			"10000",
			"/tmp/shot.png",
		]);
		expect(result).toEqual({
			cmd: "screenshot",
			args: ["/tmp/shot.png"],
			timeout: 10000,
		});
	});

	test("preserves multiple non-timeout args", () => {
		const result = parseArgs(["fill", "input.email", "user@test.com"]);
		expect(result).toEqual({
			cmd: "fill",
			args: ["input.email", "user@test.com"],
			timeout: undefined,
		});
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
