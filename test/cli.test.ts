import { describe, expect, test } from "bun:test";
import { extractStatusFlags, formatOutput, parseArgs } from "../src/cli.ts";

describe("parseArgs", () => {
	test("parses goto command with URL", () => {
		const result = parseArgs(["goto", "https://example.com"]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["https://example.com"],
			timeout: undefined,
			session: undefined,
			json: false,
		});
	});

	test("parses text command with no args", () => {
		const result = parseArgs(["text"]);
		expect(result).toEqual({
			cmd: "text",
			args: [],
			timeout: undefined,
			session: undefined,
			json: false,
		});
	});

	test("parses quit command", () => {
		const result = parseArgs(["quit"]);
		expect(result).toEqual({
			cmd: "quit",
			args: [],
			timeout: undefined,
			session: undefined,
			json: false,
		});
	});

	test("returns help command for empty args", () => {
		const result = parseArgs([]);
		expect(result).toEqual({
			cmd: "help",
			args: [],
			timeout: undefined,
			session: undefined,
			json: false,
		});
	});

	test("detects --daemon flag", () => {
		const result = parseArgs(["--daemon"]);
		expect(result).toEqual({ daemon: true });
	});

	test("passes through unknown commands (server validates)", () => {
		const result = parseArgs(["unknown"]);
		expect(result).toEqual({
			cmd: "unknown",
			args: [],
			timeout: undefined,
			session: undefined,
			json: false,
		});
	});

	test("parses help with no args", () => {
		const result = parseArgs(["help"]);
		expect(result).toEqual({
			cmd: "help",
			args: [],
			timeout: undefined,
			session: undefined,
			json: false,
		});
	});

	test("parses help with command arg", () => {
		const result = parseArgs(["help", "goto"]);
		expect(result).toEqual({
			cmd: "help",
			args: ["goto"],
			timeout: undefined,
			session: undefined,
			json: false,
		});
	});

	test("parses --help flag", () => {
		const result = parseArgs(["--help"]);
		expect(result).toEqual({
			cmd: "--help",
			args: [],
			timeout: undefined,
			session: undefined,
			json: false,
		});
	});

	test("parses -h flag", () => {
		const result = parseArgs(["-h"]);
		expect(result).toEqual({
			cmd: "-h",
			args: [],
			timeout: undefined,
			session: undefined,
			json: false,
		});
	});

	test("parses command with --help flag (interception is in runCli)", () => {
		const result = parseArgs(["goto", "--help"]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["--help"],
			timeout: undefined,
			session: undefined,
			json: false,
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
			session: undefined,
			json: false,
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
			session: undefined,
			json: false,
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
			session: undefined,
			json: false,
		});
	});

	test("zero --timeout value is ignored", () => {
		const result = parseArgs(["goto", "https://example.com", "--timeout", "0"]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["https://example.com"],
			timeout: undefined,
			session: undefined,
			json: false,
		});
	});

	test("--timeout at end without value is treated as regular arg", () => {
		const result = parseArgs(["goto", "https://example.com", "--timeout"]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["https://example.com", "--timeout"],
			timeout: undefined,
			session: undefined,
			json: false,
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
			session: undefined,
			json: false,
		});
	});

	test("preserves multiple non-timeout args", () => {
		const result = parseArgs(["fill", "input.email", "user@test.com"]);
		expect(result).toEqual({
			cmd: "fill",
			args: ["input.email", "user@test.com"],
			timeout: undefined,
			session: undefined,
			json: false,
		});
	});

	test("extracts --session flag from args", () => {
		const result = parseArgs([
			"goto",
			"https://example.com",
			"--session",
			"worker-1",
		]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["https://example.com"],
			timeout: undefined,
			session: "worker-1",
			json: false,
		});
	});

	test("extracts --json flag from args", () => {
		const result = parseArgs(["snapshot", "--json"]);
		expect(result).toEqual({
			cmd: "snapshot",
			args: [],
			timeout: undefined,
			session: undefined,
			json: true,
		});
	});

	test("combines --session, --timeout, and --json", () => {
		const result = parseArgs([
			"url",
			"--session",
			"s1",
			"--timeout",
			"5000",
			"--json",
		]);
		expect(result).toEqual({
			cmd: "url",
			args: [],
			timeout: 5000,
			session: "s1",
			json: true,
		});
	});

	test("--session as last arg results in undefined session", () => {
		const result = parseArgs(["goto", "https://example.com", "--session"]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["https://example.com"],
			timeout: undefined,
			session: undefined,
			json: false,
		});
	});

	test("duplicate --session flags uses the last value", () => {
		const result = parseArgs([
			"goto",
			"https://example.com",
			"--session",
			"first",
			"--session",
			"second",
		]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["https://example.com"],
			timeout: undefined,
			session: "second",
			json: false,
		});
	});

	// Issue #46: Global flags placed before the command name
	test("--timeout before command is parsed correctly", () => {
		const result = parseArgs(["--timeout", "5000", "ping"]);
		expect(result).toEqual({
			cmd: "ping",
			args: [],
			timeout: 5000,
			session: undefined,
			json: false,
		});
	});

	test("--session before command is parsed correctly", () => {
		const result = parseArgs(["--session", "mysession", "url"]);
		expect(result).toEqual({
			cmd: "url",
			args: [],
			timeout: undefined,
			session: "mysession",
			json: false,
		});
	});

	test("--json before command is parsed correctly", () => {
		const result = parseArgs(["--json", "status"]);
		expect(result).toEqual({
			cmd: "status",
			args: [],
			timeout: undefined,
			session: undefined,
			json: true,
		});
	});

	test("all global flags before command", () => {
		const result = parseArgs([
			"--timeout",
			"5000",
			"--session",
			"s1",
			"--json",
			"goto",
			"https://example.com",
		]);
		expect(result).toEqual({
			cmd: "goto",
			args: ["https://example.com"],
			timeout: 5000,
			session: "s1",
			json: true,
		});
	});

	test("global flags mixed before and after command", () => {
		const result = parseArgs([
			"--timeout",
			"3000",
			"screenshot",
			"--session",
			"s2",
			"/tmp/shot.png",
		]);
		expect(result).toEqual({
			cmd: "screenshot",
			args: ["/tmp/shot.png"],
			timeout: 3000,
			session: "s2",
			json: false,
		});
	});

	test("--config and --timeout both before command", () => {
		const result = parseArgs([
			"--config",
			"/tmp/cfg.json",
			"--timeout",
			"8000",
			"ping",
		]);
		expect(result).toEqual({
			cmd: "ping",
			args: [],
			timeout: 8000,
			session: undefined,
			json: false,
			config: "/tmp/cfg.json",
		});
	});
});

describe("extractStatusFlags", () => {
	test("returns defaults when no flags present", () => {
		const result = extractStatusFlags([]);
		expect(result).toEqual({
			watch: false,
			interval: 5,
			exitCode: false,
			cleanArgs: [],
		});
	});

	test("extracts --watch flag", () => {
		const result = extractStatusFlags(["--watch"]);
		expect(result).toEqual({
			watch: true,
			interval: 5,
			exitCode: false,
			cleanArgs: [],
		});
	});

	test("extracts --interval with value", () => {
		const result = extractStatusFlags(["--watch", "--interval", "10"]);
		expect(result).toEqual({
			watch: true,
			interval: 10,
			exitCode: false,
			cleanArgs: [],
		});
	});

	test("extracts --exit-code flag", () => {
		const result = extractStatusFlags(["--exit-code"]);
		expect(result).toEqual({
			watch: false,
			interval: 5,
			exitCode: true,
			cleanArgs: [],
		});
	});

	test("preserves unrelated args", () => {
		const result = extractStatusFlags(["--exit-code", "--json"]);
		expect(result).toEqual({
			watch: false,
			interval: 5,
			exitCode: true,
			cleanArgs: ["--json"],
		});
	});

	test("invalid --interval value defaults to 5", () => {
		const result = extractStatusFlags(["--watch", "--interval", "abc"]);
		expect(result).toEqual({
			watch: true,
			interval: 5,
			exitCode: false,
			cleanArgs: [],
		});
	});

	test("--interval without value defaults to 5", () => {
		const result = extractStatusFlags(["--watch", "--interval"]);
		expect(result).toEqual({
			watch: true,
			interval: 5,
			exitCode: false,
			cleanArgs: [],
		});
	});

	test("--interval 0 or negative defaults to 5", () => {
		const result = extractStatusFlags(["--watch", "--interval", "0"]);
		expect(result).toEqual({
			watch: true,
			interval: 5,
			exitCode: false,
			cleanArgs: [],
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
