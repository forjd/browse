import { beforeEach, describe, expect, test } from "bun:test";
import { RingBuffer } from "../src/buffers.ts";
import {
	handleCDPConsoleEvent,
	handleCDPLogEvent,
} from "../src/cdp-console.ts";
import {
	type ConsoleEntry,
	formatConsoleEntries,
	handleConsole,
} from "../src/commands/console.ts";

function makeEntry(overrides: Partial<ConsoleEntry> = {}): ConsoleEntry {
	return {
		level: "log",
		text: "test message",
		location: {
			url: "https://example.com/app.js",
			lineNumber: 42,
			columnNumber: 10,
		},
		timestamp: Date.now(),
		...overrides,
	};
}

describe("console command", () => {
	let buffer: RingBuffer<ConsoleEntry>;

	beforeEach(() => {
		buffer = new RingBuffer<ConsoleEntry>(500);
	});

	test("returns formatted messages and drains buffer", () => {
		buffer.push(makeEntry({ level: "error", text: "Something broke" }));
		buffer.push(makeEntry({ level: "log", text: "User loaded" }));

		const res = handleConsole(buffer, []);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("[ERROR] Something broke");
			expect(res.data).toContain("[LOG] User loaded");
		}

		// Buffer should be drained
		const res2 = handleConsole(buffer, []);
		expect(res2.ok).toBe(true);
		if (res2.ok) {
			expect(res2.data).toBe("No console messages.");
		}
	});

	test("filters by --level", () => {
		buffer.push(makeEntry({ level: "error", text: "Error msg" }));
		buffer.push(makeEntry({ level: "log", text: "Log msg" }));
		buffer.push(makeEntry({ level: "warning", text: "Warn msg" }));

		const res = handleConsole(buffer, ["--level", "error"]);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("[ERROR] Error msg");
			expect(res.data).not.toContain("[LOG]");
			expect(res.data).not.toContain("[WARNING]");
		}

		// Buffer still drained
		expect(handleConsole(buffer, []).ok && handleConsole(buffer, []).ok).toBe(
			true,
		);
	});

	test("--keep preserves buffer", () => {
		buffer.push(makeEntry({ level: "log", text: "Persistent" }));

		const res1 = handleConsole(buffer, ["--keep"]);
		expect(res1.ok).toBe(true);
		if (res1.ok) {
			expect(res1.data).toContain("[LOG] Persistent");
		}

		// Buffer NOT drained
		const res2 = handleConsole(buffer, []);
		expect(res2.ok).toBe(true);
		if (res2.ok) {
			expect(res2.data).toContain("[LOG] Persistent");
		}
	});

	test("invalid --level returns error", () => {
		const res = handleConsole(buffer, ["--level", "fatal"]);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("fatal");
			expect(res.error).toContain("log");
			expect(res.error).toContain("error");
		}
	});

	test("--level without value returns error", () => {
		const res = handleConsole(buffer, ["--level"]);
		expect(res.ok).toBe(false);
	});

	test("empty buffer returns 'No console messages.'", () => {
		const res = handleConsole(buffer, []);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("No console messages.");
		}
	});

	test("formats location on continuation line", () => {
		buffer.push(
			makeEntry({
				level: "error",
				text: "Uncaught TypeError",
				location: {
					url: "https://staging.example.com/static/js/app.js",
					lineNumber: 47,
					columnNumber: 12,
				},
			}),
		);

		const res = handleConsole(buffer, []);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("[ERROR] Uncaught TypeError");
			expect(res.data).toContain(
				"        at https://staging.example.com/static/js/app.js:47:12",
			);
		}
	});

	test("returns JSON array when json option is true", () => {
		buffer.push(makeEntry({ level: "error", text: "Something broke" }));
		buffer.push(makeEntry({ level: "log", text: "User loaded" }));

		const res = handleConsole(buffer, [], { json: true });
		expect(res.ok).toBe(true);
		if (res.ok) {
			const parsed = JSON.parse(res.data);
			expect(Array.isArray(parsed)).toBe(true);
			expect(parsed).toHaveLength(2);
			expect(parsed[0].level).toBe("error");
			expect(parsed[0].text).toBe("Something broke");
			expect(parsed[1].level).toBe("log");
		}
	});

	test("returns empty JSON array when no messages and json is true", () => {
		const res = handleConsole(buffer, [], { json: true });
		expect(res.ok).toBe(true);
		if (res.ok) {
			const parsed = JSON.parse(res.data);
			expect(parsed).toEqual([]);
		}
	});

	test("JSON output respects --level filter", () => {
		buffer.push(makeEntry({ level: "error", text: "Error msg" }));
		buffer.push(makeEntry({ level: "log", text: "Log msg" }));

		const res = handleConsole(buffer, ["--level", "error"], { json: true });
		expect(res.ok).toBe(true);
		if (res.ok) {
			const parsed = JSON.parse(res.data);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].level).toBe("error");
		}
	});
});

describe("formatConsoleEntries", () => {
	test("uppercases level", () => {
		const formatted = formatConsoleEntries([
			makeEntry({ level: "warning", text: "test" }),
		]);
		expect(formatted).toContain("[WARNING]");
	});

	test("multiple entries separated by blank lines", () => {
		const entries = [
			makeEntry({ level: "log", text: "first" }),
			makeEntry({ level: "error", text: "second" }),
		];
		const formatted = formatConsoleEntries(entries);
		expect(formatted).toContain("\n\n");
	});
});

describe("CDP console capture", () => {
	let buffer: RingBuffer<ConsoleEntry>;

	beforeEach(() => {
		buffer = new RingBuffer<ConsoleEntry>(500);
	});

	describe("handleCDPConsoleEvent", () => {
		test("captures console.log with string argument", () => {
			handleCDPConsoleEvent(
				{
					type: "log",
					args: [{ type: "string", value: "Hello world" }],
					stackTrace: {
						callFrames: [
							{
								url: "https://example.com/app.js",
								lineNumber: 10,
								columnNumber: 5,
							},
						],
					},
				},
				buffer,
			);

			const entries = buffer.peek();
			expect(entries).toHaveLength(1);
			expect(entries[0].level).toBe("log");
			expect(entries[0].text).toBe("Hello world");
			expect(entries[0].location.url).toBe("https://example.com/app.js");
			expect(entries[0].location.lineNumber).toBe(10);
			expect(entries[0].location.columnNumber).toBe(5);
		});

		test("captures console.warn", () => {
			handleCDPConsoleEvent(
				{
					type: "warning",
					args: [{ type: "string", value: "Warning message" }],
					stackTrace: { callFrames: [] },
				},
				buffer,
			);

			const entries = buffer.peek();
			expect(entries).toHaveLength(1);
			expect(entries[0].level).toBe("warning");
			expect(entries[0].text).toBe("Warning message");
		});

		test("captures console.error", () => {
			handleCDPConsoleEvent(
				{
					type: "error",
					args: [{ type: "string", value: "Error message" }],
					stackTrace: { callFrames: [] },
				},
				buffer,
			);

			const entries = buffer.peek();
			expect(entries).toHaveLength(1);
			expect(entries[0].level).toBe("error");
			expect(entries[0].text).toBe("Error message");
		});

		test("joins multiple arguments with spaces", () => {
			handleCDPConsoleEvent(
				{
					type: "log",
					args: [
						{ type: "string", value: "count:" },
						{ type: "number", value: 42, description: "42" },
					],
					stackTrace: { callFrames: [] },
				},
				buffer,
			);

			const entries = buffer.peek();
			expect(entries[0].text).toBe("count: 42");
		});

		test("uses description for object arguments", () => {
			handleCDPConsoleEvent(
				{
					type: "log",
					args: [
						{
							type: "object",
							description: "Object",
							className: "Object",
						},
					],
					stackTrace: { callFrames: [] },
				},
				buffer,
			);

			const entries = buffer.peek();
			expect(entries[0].text).toBe("Object");
		});

		test("handles missing stackTrace gracefully", () => {
			handleCDPConsoleEvent(
				{
					type: "log",
					args: [{ type: "string", value: "no stack" }],
				},
				buffer,
			);

			const entries = buffer.peek();
			expect(entries).toHaveLength(1);
			expect(entries[0].text).toBe("no stack");
			expect(entries[0].location.url).toBe("");
			expect(entries[0].location.lineNumber).toBe(0);
		});

		test("handles empty args array", () => {
			handleCDPConsoleEvent(
				{
					type: "log",
					args: [],
					stackTrace: { callFrames: [] },
				},
				buffer,
			);

			const entries = buffer.peek();
			expect(entries).toHaveLength(1);
			expect(entries[0].text).toBe("");
		});

		test("uses value for boolean and undefined args", () => {
			handleCDPConsoleEvent(
				{
					type: "log",
					args: [{ type: "boolean", value: true }, { type: "undefined" }],
					stackTrace: { callFrames: [] },
				},
				buffer,
			);

			const entries = buffer.peek();
			expect(entries[0].text).toBe("true undefined");
		});

		test("prefers value over description for primitives", () => {
			handleCDPConsoleEvent(
				{
					type: "log",
					args: [{ type: "number", value: 3.14, description: "3.14" }],
					stackTrace: { callFrames: [] },
				},
				buffer,
			);

			const entries = buffer.peek();
			expect(entries[0].text).toBe("3.14");
		});
	});

	describe("handleCDPLogEvent", () => {
		test("captures resource errors", () => {
			handleCDPLogEvent(
				{
					entry: {
						level: "error",
						text: "Failed to load resource: 404",
						source: "network",
						url: "https://example.com/missing.js",
						lineNumber: 0,
					},
				},
				buffer,
			);

			const entries = buffer.peek();
			expect(entries).toHaveLength(1);
			expect(entries[0].level).toBe("error");
			expect(entries[0].text).toBe("Failed to load resource: 404");
			expect(entries[0].location.url).toBe("https://example.com/missing.js");
		});

		test("ignores worker source entries", () => {
			handleCDPLogEvent(
				{
					entry: {
						level: "error",
						text: "Worker error",
						source: "worker",
						url: "",
						lineNumber: 0,
					},
				},
				buffer,
			);

			const entries = buffer.peek();
			expect(entries).toHaveLength(0);
		});

		test("handles missing url and lineNumber", () => {
			handleCDPLogEvent(
				{
					entry: {
						level: "warning",
						text: "Deprecation warning",
						source: "deprecation",
					},
				},
				buffer,
			);

			const entries = buffer.peek();
			expect(entries).toHaveLength(1);
			expect(entries[0].location.url).toBe("");
			expect(entries[0].location.lineNumber).toBe(0);
		});
	});
});
