import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import {
	getStateFilePath,
	loadPersistedDaemonState,
	persistDaemonState,
} from "../../src/session-state.ts";

const stateFile = getStateFilePath();

afterEach(() => {
	rmSync(stateFile, { force: true });
});

describe("session-state persistence", () => {
	test("persists and reloads valid state", () => {
		persistDaemonState({
			version: 1,
			updatedAt: new Date().toISOString(),
			sessions: [
				{
					name: "default",
					isolated: false,
					activeTabIndex: 0,
					tabs: [{ url: "https://example.com" }],
				},
			],
		});
		const loaded = loadPersistedDaemonState();
		expect(loaded?.sessions[0]?.tabs[0]?.url).toBe("https://example.com");
	});

	test("detects corrupted state and backs it up", () => {
		writeFileSync(stateFile, "{not-valid-json");
		const loaded = loadPersistedDaemonState();
		expect(loaded).toBeNull();
		expect(existsSync(stateFile)).toBeTrue();
	});
});
