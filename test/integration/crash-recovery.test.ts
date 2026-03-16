import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LifecycleConfig } from "../../src/lifecycle.ts";
import { checkStalePid, cleanupFiles } from "../../src/lifecycle.ts";
import type { Response } from "../../src/protocol.ts";
import {
	type RetryDeps,
	resetCircuitBreaker,
	sendWithRetry,
} from "../../src/retry.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-crash");
let testIndex = 0;

function testPaths(): LifecycleConfig & { dir: string } {
	testIndex++;
	const dir = join(TEST_DIR, `run-${testIndex}`);
	mkdirSync(dir, { recursive: true });
	return {
		dir,
		socketPath: join(dir, "test.sock"),
		pidPath: join(dir, "test.pid"),
		idleTimeoutMs: 60_000,
	};
}

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
	resetCircuitBreaker();
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("integration: crash recovery", () => {
	test("stale PID file with dead process is cleaned up", () => {
		const config = testPaths();
		// Write a PID that doesn't exist (99999999 is unlikely to be running)
		writeFileSync(config.pidPath, "99999999");

		const isAlive = checkStalePid(config);
		expect(isAlive).toBe(false);
		expect(existsSync(config.pidPath)).toBe(false);
	});

	test("stale PID file with garbage content is cleaned up", () => {
		const config = testPaths();
		writeFileSync(config.pidPath, "not-a-pid");

		const isAlive = checkStalePid(config);
		expect(isAlive).toBe(false);
		expect(existsSync(config.pidPath)).toBe(false);
	});

	test("cleanupFiles removes socket and PID files", () => {
		const config = testPaths();
		writeFileSync(config.pidPath, "12345");
		writeFileSync(config.socketPath, "");

		cleanupFiles(config);

		expect(existsSync(config.pidPath)).toBe(false);
		expect(existsSync(config.socketPath)).toBe(false);
	});

	test("sendWithRetry recovers from daemon crash mid-command", async () => {
		let callCount = 0;
		const deps: RetryDeps = {
			sendRequest: mock(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.reject(new Error("Failed to parse daemon response"));
				}
				return Promise.resolve({ ok: true, data: "recovered" } as Response);
			}),
			spawnDaemon: mock(() => Promise.resolve()),
			cleanupStaleFiles: mock(() => {}),
		};

		const result = await sendWithRetry(deps, "text", []);
		expect(result).toEqual({ ok: true, data: "recovered" });
		expect(deps.cleanupStaleFiles).toHaveBeenCalled();
		expect(deps.spawnDaemon).toHaveBeenCalled();
	});

	test("session state is lost after crash (expected)", async () => {
		// After a crash and recovery, the new daemon has no previous state.
		// This test verifies the retry mechanism works and returns fresh results.
		let callCount = 0;
		const deps: RetryDeps = {
			sendRequest: mock(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.reject(new Error("DAEMON_NOT_RUNNING"));
				}
				// Fresh daemon returns fresh state
				return Promise.resolve({
					ok: true,
					data: "No console messages.",
				} as Response);
			}),
			spawnDaemon: mock(() => Promise.resolve()),
			cleanupStaleFiles: mock(() => {}),
		};

		const result = await sendWithRetry(deps, "console", []);
		expect(result).toEqual({ ok: true, data: "No console messages." });
	});

	test("double failure returns error without infinite loop", async () => {
		const deps: RetryDeps = {
			sendRequest: mock(() =>
				Promise.reject(new Error("Daemon connection lost.")),
			),
			spawnDaemon: mock(() => Promise.resolve()),
			cleanupStaleFiles: mock(() => {}),
		};

		await expect(sendWithRetry(deps, "text", [])).rejects.toThrow(
			"Daemon crashed and recovery failed after 3 attempts",
		);
		// 1 initial + 3 retry attempts = 4 calls
		expect(deps.sendRequest).toHaveBeenCalledTimes(4);
	});
});
