import { describe, expect, test } from "bun:test";
import type { Response } from "../src/protocol.ts";
import { parseRequest, serialiseResponse } from "../src/protocol.ts";

/** Helper to build expected parsed request with defaults */
function req(
	cmd: string,
	args: string[],
	overrides: Record<string, unknown> = {},
) {
	return {
		cmd,
		args,
		timeout: undefined,
		session: undefined,
		json: false,
		...overrides,
	};
}

describe("parseRequest", () => {
	test("parses a valid goto request", () => {
		const result = parseRequest(
			'{"cmd":"goto","args":["https://example.com"]}',
		);
		expect(result).toEqual(req("goto", ["https://example.com"]));
	});

	test("parses a valid text request with no args", () => {
		const result = parseRequest('{"cmd":"text","args":[]}');
		expect(result).toEqual(req("text", []));
	});

	test("parses a valid quit request", () => {
		const result = parseRequest('{"cmd":"quit","args":[]}');
		expect(result).toEqual(req("quit", []));
	});

	test("parses snapshot command with flags", () => {
		const result = parseRequest('{"cmd":"snapshot","args":["-i"]}');
		expect(result).toEqual(req("snapshot", ["-i"]));
	});

	test("parses click command with ref", () => {
		const result = parseRequest('{"cmd":"click","args":["@e1"]}');
		expect(result).toEqual(req("click", ["@e1"]));
	});

	test("parses fill command with ref and value", () => {
		const result = parseRequest('{"cmd":"fill","args":["@e3","hello world"]}');
		expect(result).toEqual(req("fill", ["@e3", "hello world"]));
	});

	test("parses select command with ref and option", () => {
		const result = parseRequest('{"cmd":"select","args":["@e5","Admin"]}');
		expect(result).toEqual(req("select", ["@e5", "Admin"]));
	});

	test("parses auth-state command with subcommand and path", () => {
		const result = parseRequest(
			'{"cmd":"auth-state","args":["save","/tmp/auth.json"]}',
		);
		expect(result).toEqual(req("auth-state", ["save", "/tmp/auth.json"]));
	});

	test("parses login command with --env flag", () => {
		const result = parseRequest('{"cmd":"login","args":["--env","staging"]}');
		expect(result).toEqual(req("login", ["--env", "staging"]));
	});

	test("parses tab command with subcommand", () => {
		const result = parseRequest('{"cmd":"tab","args":["list"]}');
		expect(result).toEqual(req("tab", ["list"]));
	});

	test("parses request with session field", () => {
		const result = parseRequest('{"cmd":"url","args":[],"session":"worker-1"}');
		expect(result).toEqual(req("url", [], { session: "worker-1" }));
	});

	test("parses request with json field", () => {
		const result = parseRequest('{"cmd":"snapshot","args":[],"json":true}');
		expect(result).toEqual(req("snapshot", [], { json: true }));
	});

	test("parses session command", () => {
		const result = parseRequest('{"cmd":"session","args":["list"]}');
		expect(result).toEqual(req("session", ["list"]));
	});

	test("parses ping command", () => {
		const result = parseRequest('{"cmd":"ping","args":[]}');
		expect(result).toEqual(req("ping", []));
	});

	test("parses status command", () => {
		const result = parseRequest('{"cmd":"status","args":[]}');
		expect(result).toEqual(req("status", []));
	});

	test("parses a batch request with top-level defaults", () => {
		const result = parseRequest(
			'{"batch":[{"cmd":"ping","args":[]},{"cmd":"url","args":[]}],"session":"worker-1","continueOnError":true}',
		);
		expect(result).toEqual({
			batch: [
				{
					cmd: "ping",
					args: [],
					timeout: undefined,
					session: undefined,
					json: false,
				},
				{
					cmd: "url",
					args: [],
					timeout: undefined,
					session: undefined,
					json: false,
				},
			],
			continueOnError: true,
			timeout: undefined,
			session: "worker-1",
			json: false,
			token: undefined,
		});
	});

	test("throws on malformed JSON", () => {
		expect(() => parseRequest("not json")).toThrow("Invalid JSON");
	});

	test("throws when cmd is missing", () => {
		expect(() => parseRequest('{"args":[]}')).toThrow("Missing cmd field");
	});

	test("throws when cmd is not a string", () => {
		expect(() => parseRequest('{"cmd":123,"args":[]}')).toThrow(
			"Missing cmd field",
		);
	});

	test("throws when args is missing", () => {
		expect(() => parseRequest('{"cmd":"goto"}')).toThrow("Missing args field");
	});

	test("throws when args is not an array", () => {
		expect(() => parseRequest('{"cmd":"goto","args":"bad"}')).toThrow(
			"Missing args field",
		);
	});

	test("throws on unknown command", () => {
		expect(() => parseRequest('{"cmd":"dance","args":[]}')).toThrow(
			"Unknown command: dance",
		);
	});
});

describe("serialiseResponse", () => {
	test("serialises a success response", () => {
		const response: Response = { ok: true, data: "Example Domain" };
		const json = serialiseResponse(response);
		expect(JSON.parse(json)).toEqual({ ok: true, data: "Example Domain" });
	});

	test("serialises an error response", () => {
		const response: Response = { ok: false, error: "Something went wrong" };
		const json = serialiseResponse(response);
		expect(JSON.parse(json)).toEqual({
			ok: false,
			error: "Something went wrong",
		});
	});

	test("output ends with a newline", () => {
		const json = serialiseResponse({ ok: true, data: "test" });
		expect(json.endsWith("\n")).toBe(true);
	});
});
