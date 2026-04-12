import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	loadPersistedDaemonState,
	persistDaemonState,
	setStateFilePathForTesting,
} from "../../src/session-state.ts";

let tempDir: string | null = null;

function setupTempStateFile(): string {
	tempDir = mkdtempSync(join(tmpdir(), "browse-session-state-test-"));
	const stateFile = join(tempDir, "session-state.json");
	setStateFilePathForTesting(stateFile);
	return stateFile;
}

afterEach(() => {
	setStateFilePathForTesting(null);
	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
		tempDir = null;
	}
});

describe("session-state persistence", () => {
	test("persists and reloads valid state", async () => {
		setupTempStateFile();
		await persistDaemonState({
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
		const stateFile = setupTempStateFile();
		writeFileSync(stateFile, "{not-valid-json");
		const loaded = loadPersistedDaemonState();
		expect(loaded).toBeNull();
		expect(existsSync(stateFile)).toBeTrue();
		const entries = readdirSync(tempDir as string);
		expect(
			entries.some((name) => name.startsWith("session-state.json.corrupt-")),
		).toBeTrue();
	});
});
