import { describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createTraceState,
	handleTrace,
	listTraceFiles,
	type SpawnFn,
} from "../../src/commands/trace.ts";

// Stub BrowserContext with just enough for trace tests
function mockContext(opts?: {
	startFail?: boolean;
	stopFail?: boolean;
	stopNoFile?: boolean;
}) {
	return {
		tracing: {
			start: opts?.startFail
				? mock(() => Promise.reject(new Error("start failed")))
				: mock(() => Promise.resolve()),
			stop: opts?.stopFail
				? mock(() => Promise.reject(new Error("stop failed")))
				: mock(({ path }: { path: string }) => {
						if (!opts?.stopNoFile) {
							mkdirSync(join(path, ".."), { recursive: true });
							writeFileSync(path, "fake-trace");
						}
						return Promise.resolve();
					}),
		},
	} as never;
}

function noopSpawn(): SpawnFn {
	return mock((_cmd: string, _args: string[]) => ({ pid: 12345 }));
}

describe("trace subcommand routing", () => {
	test("returns usage when no args", async () => {
		const result = await handleTrace(mockContext(), createTraceState(), []);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage:");
			expect(result.error).toContain("trace view");
		}
	});

	test("returns error for unknown subcommand", async () => {
		const result = await handleTrace(mockContext(), createTraceState(), [
			"foobar",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown trace subcommand");
			expect(result.error).toContain("view");
			expect(result.error).toContain("list");
		}
	});
});

describe("trace list", () => {
	test("returns message when no traces exist", async () => {
		const result = await handleTrace(mockContext(), createTraceState(), [
			"list",
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			// Either "No traces found" or lists traces from user's machine
			expect(typeof result.data).toBe("string");
		}
	});
});

describe("trace view", () => {
	test("returns error when no path and no --latest", async () => {
		const result = await handleTrace(mockContext(), createTraceState(), [
			"view",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Provide a trace file path");
		}
	});

	test("returns error when file does not exist", async () => {
		const result = await handleTrace(mockContext(), createTraceState(), [
			"view",
			"/tmp/nonexistent-trace-12345.zip",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Trace file not found");
		}
	});

	test("launches viewer for existing file", async () => {
		const tmpFile = join(tmpdir(), `test-trace-${Date.now()}.zip`);
		writeFileSync(tmpFile, "fake-trace-data");

		const spawn = noopSpawn();
		const result = await handleTrace(
			mockContext(),
			createTraceState(),
			["view", tmpFile],
			{ spawn },
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Trace viewer opened");
			expect(result.data).toContain("PID: 12345");
		}

		expect(spawn).toHaveBeenCalledTimes(1);

		// Clean up
		rmSync(tmpFile, { force: true });
	});

	test("passes --port to spawn args", async () => {
		const tmpFile = join(tmpdir(), `test-trace-port-${Date.now()}.zip`);
		writeFileSync(tmpFile, "fake-trace-data");

		const spawn = noopSpawn();
		const result = await handleTrace(
			mockContext(),
			createTraceState(),
			["view", tmpFile, "--port", "9300"],
			{ spawn },
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Serving on port 9300");
		}

		// Verify spawn was called with port args
		const spawnArgs = (spawn as ReturnType<typeof mock>).mock.calls[0];
		const allArgs = spawnArgs?.[1] as string[];
		expect(allArgs).toContain("--port");
		expect(allArgs).toContain("9300");

		rmSync(tmpFile, { force: true });
	});

	test("returns error when spawn fails", async () => {
		const tmpFile = join(tmpdir(), `test-trace-fail-${Date.now()}.zip`);
		writeFileSync(tmpFile, "fake-trace-data");

		const failSpawn: SpawnFn = () => {
			throw new Error("spawn failed");
		};

		const result = await handleTrace(
			mockContext(),
			createTraceState(),
			["view", tmpFile],
			{ spawn: failSpawn },
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Failed to launch trace viewer");
		}

		rmSync(tmpFile, { force: true });
	});
});

describe("trace stop output", () => {
	test("stop message references browse trace view", async () => {
		const tmpDir = join(tmpdir(), `browse-trace-test-${Date.now()}`);
		mkdirSync(tmpDir, { recursive: true });
		const outPath = join(tmpDir, "trace.zip");

		const state = createTraceState();
		state.recording = true;
		state.startedAt = Date.now() - 5000;

		const result = await handleTrace(mockContext(), state, [
			"stop",
			"--out",
			outPath,
		]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("browse trace view");
			expect(result.data).not.toContain("npx playwright");
		}

		rmSync(tmpDir, { recursive: true, force: true });
	});
});

describe("listTraceFiles", () => {
	test("returns an array", () => {
		const files = listTraceFiles();
		expect(Array.isArray(files)).toBe(true);
	});

	test("each entry has required fields", () => {
		const files = listTraceFiles();
		for (const f of files) {
			expect(typeof f.name).toBe("string");
			expect(typeof f.path).toBe("string");
			expect(f.mtime).toBeInstanceOf(Date);
			expect(typeof f.sizeBytes).toBe("number");
		}
	});
});
