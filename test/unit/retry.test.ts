import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Response } from "../../src/protocol.ts";
import {
	isRetriableError,
	resetCircuitBreaker,
	type RetryDeps,
	sendWithRetry,
} from "../../src/retry.ts";

function makeDeps(overrides: Partial<RetryDeps> = {}): RetryDeps {
	return {
		sendRequest: mock(() =>
			Promise.resolve({ ok: true, data: "ok" } as Response),
		),
		spawnDaemon: mock(() => Promise.resolve()),
		cleanupStaleFiles: mock(() => {}),
		...overrides,
	};
}

beforeEach(() => {
	resetCircuitBreaker();
});

describe("isRetriableError", () => {
	test("returns true for DAEMON_NOT_RUNNING", () => {
		expect(isRetriableError(new Error("DAEMON_NOT_RUNNING"))).toBe(true);
	});

	test("returns true for connection lost", () => {
		expect(isRetriableError(new Error("Daemon connection lost."))).toBe(true);
	});

	test("returns true for parse failure (mid-read drop)", () => {
		expect(isRetriableError(new Error("Failed to parse daemon response"))).toBe(
			true,
		);
	});

	test("returns false for other errors", () => {
		expect(isRetriableError(new Error("Some random error"))).toBe(false);
	});

	test("returns false for non-Error values", () => {
		expect(isRetriableError("string error")).toBe(false);
	});
});

describe("sendWithRetry", () => {
	test("returns result on first success", async () => {
		const deps = makeDeps();
		const result = await sendWithRetry(deps, "goto", ["https://example.com"]);

		expect(result).toEqual({ ok: true, data: "ok" });
		expect(deps.sendRequest).toHaveBeenCalledTimes(1);
		expect(deps.spawnDaemon).not.toHaveBeenCalled();
	});

	test("connection refused triggers cold-start and retry", async () => {
		let callCount = 0;
		const deps = makeDeps({
			sendRequest: mock(() => {
				callCount++;
				if (callCount === 1)
					return Promise.reject(new Error("DAEMON_NOT_RUNNING"));
				return Promise.resolve({ ok: true, data: "recovered" } as Response);
			}),
		});

		const result = await sendWithRetry(deps, "goto", ["https://example.com"]);

		expect(result).toEqual({ ok: true, data: "recovered" });
		expect(deps.cleanupStaleFiles).toHaveBeenCalled();
		expect(deps.spawnDaemon).toHaveBeenCalled();
	});

	test("connection drops mid-read triggers restart and retry", async () => {
		let callCount = 0;
		const deps = makeDeps({
			sendRequest: mock(() => {
				callCount++;
				if (callCount === 1)
					return Promise.reject(new Error("Failed to parse daemon response"));
				return Promise.resolve({ ok: true, data: "recovered" } as Response);
			}),
		});

		const result = await sendWithRetry(deps, "text", []);

		expect(result).toEqual({ ok: true, data: "recovered" });
		expect(deps.spawnDaemon).toHaveBeenCalled();
	});

	test("retry fails — returns error after 3 attempts", async () => {
		const deps = makeDeps({
			sendRequest: mock(() => Promise.reject(new Error("DAEMON_NOT_RUNNING"))),
		});

		await expect(sendWithRetry(deps, "text", [])).rejects.toThrow(
			"Daemon crashed and recovery failed after 3 attempts",
		);
		// sendRequest called: 1 initial + 3 retries = 4
		expect(deps.sendRequest).toHaveBeenCalledTimes(4);
	});

	test("application-level error (ok: false) is not retried", async () => {
		const deps = makeDeps({
			sendRequest: mock(() =>
				Promise.resolve({ ok: false, error: "Bad input" } as Response),
			),
		});

		const result = await sendWithRetry(deps, "goto", ["bad"]);

		expect(result).toEqual({ ok: false, error: "Bad input" });
		expect(deps.sendRequest).toHaveBeenCalledTimes(1);
		expect(deps.spawnDaemon).not.toHaveBeenCalled();
	});

	test("spawn daemon failure returns descriptive error after retries", async () => {
		const deps = makeDeps({
			sendRequest: mock(() => Promise.reject(new Error("DAEMON_NOT_RUNNING"))),
			spawnDaemon: mock(() => Promise.reject(new Error("spawn failed"))),
		});

		await expect(sendWithRetry(deps, "text", [])).rejects.toThrow(
			"Daemon crashed and recovery failed after 3 attempts",
		);
	});

	test("circuit breaker opens after consecutive failures", async () => {
		const deps = makeDeps({
			sendRequest: mock(() => Promise.reject(new Error("DAEMON_NOT_RUNNING"))),
		});

		// First call exhausts retries
		await expect(sendWithRetry(deps, "text", [])).rejects.toThrow(
			"Daemon crashed and recovery failed",
		);

		// Circuit breaker should now be open
		await expect(sendWithRetry(deps, "text", [])).rejects.toThrow(
			"Circuit breaker open",
		);
	});

	test("circuit breaker resets after success", async () => {
		// Fail then succeed
		let callCount = 0;
		const deps = makeDeps({
			sendRequest: mock(() => {
				callCount++;
				if (callCount === 1)
					return Promise.reject(new Error("DAEMON_NOT_RUNNING"));
				return Promise.resolve({ ok: true, data: "ok" } as Response);
			}),
		});

		const result = await sendWithRetry(deps, "text", []);
		expect(result).toEqual({ ok: true, data: "ok" });

		// Should work fine after reset (not tripped)
		const result2 = await sendWithRetry(deps, "text", []);
		expect(result2).toEqual({ ok: true, data: "ok" });
	});
});
