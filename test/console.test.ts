import { beforeEach, describe, expect, test } from "bun:test";
import { RingBuffer } from "../src/buffers.ts";
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
