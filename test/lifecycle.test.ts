import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	checkStalePid,
	cleanupFiles,
	createIdleTimer,
	type LifecycleConfig,
	writePidFile,
} from "../src/lifecycle.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-lifecycle");

function testConfig(overrides?: Partial<LifecycleConfig>): LifecycleConfig {
	return {
		pidPath: join(TEST_DIR, "test.pid"),
		socketPath: join(TEST_DIR, "test.sock"),
		idleTimeoutMs: 30 * 60 * 1000,
		...overrides,
	};
}

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("writePidFile", () => {
	test("writes the current PID to the file", () => {
		const config = testConfig();
		writePidFile(config);
		const content = readFileSync(config.pidPath, "utf-8").trim();
		expect(content).toBe(String(process.pid));
	});

	test("overwrites a stale PID file", () => {
		const config = testConfig();
		writeFileSync(config.pidPath, "99999999");
		writePidFile(config);
		const content = readFileSync(config.pidPath, "utf-8").trim();
		expect(content).toBe(String(process.pid));
	});
});

describe("checkStalePid", () => {
	test("returns false when no PID file exists", () => {
		const config = testConfig();
		expect(checkStalePid(config)).toBe(false);
	});

	test("returns true when PID file points to a live process", () => {
		const config = testConfig();
		// Write our own PID — guaranteed alive
		writeFileSync(config.pidPath, String(process.pid));
		expect(checkStalePid(config)).toBe(true);
	});

	test("returns false and removes stale PID file", () => {
		const config = testConfig();
		writeFileSync(config.pidPath, "99999999");
		expect(checkStalePid(config)).toBe(false);
		expect(existsSync(config.pidPath)).toBe(false);
	});
});

describe("cleanupFiles", () => {
	test("removes PID and socket files", () => {
		const config = testConfig();
		writeFileSync(config.pidPath, "123");
		writeFileSync(config.socketPath, "");
		cleanupFiles(config);
		expect(existsSync(config.pidPath)).toBe(false);
		expect(existsSync(config.socketPath)).toBe(false);
	});

	test("does not throw when files do not exist", () => {
		const config = testConfig();
		expect(() => cleanupFiles(config)).not.toThrow();
	});
});

describe("createIdleTimer", () => {
	test("calls shutdown after timeout", async () => {
		let shutdownCalled = false;
		const config = testConfig({ idleTimeoutMs: 50 });
		const timer = createIdleTimer(config, () => {
			shutdownCalled = true;
		});

		await Bun.sleep(100);
		expect(shutdownCalled).toBe(true);
		timer.clear();
	});

	test("reset postpones the shutdown", async () => {
		let shutdownCalled = false;
		const config = testConfig({ idleTimeoutMs: 80 });
		const timer = createIdleTimer(config, () => {
			shutdownCalled = true;
		});

		await Bun.sleep(50);
		timer.reset();
		await Bun.sleep(50);
		expect(shutdownCalled).toBe(false);

		await Bun.sleep(50);
		expect(shutdownCalled).toBe(true);
		timer.clear();
	});

	test("clear prevents shutdown", async () => {
		let shutdownCalled = false;
		const config = testConfig({ idleTimeoutMs: 50 });
		const timer = createIdleTimer(config, () => {
			shutdownCalled = true;
		});

		timer.clear();
		await Bun.sleep(100);
		expect(shutdownCalled).toBe(false);
	});
});
