import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFile,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

type TabSnapshot = {
	url: string;
};

type SessionSnapshot = {
	name: string;
	isolated: boolean;
	activeTabIndex: number;
	tabs: TabSnapshot[];
};

export type PersistedDaemonState = {
	version: 1;
	updatedAt: string;
	sessions: SessionSnapshot[];
};

const STATE_DIR = join(homedir(), ".bun-browse");
const STATE_FILE = join(STATE_DIR, "session-state.json");
const writeFileAsync = promisify(writeFile);
let overrideStateFilePath: string | null = null;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function getStateFilePath(): string {
	return overrideStateFilePath ?? STATE_FILE;
}

/**
 * Test hook: override the default persisted state path.
 */
export function setStateFilePathForTesting(path: string | null): void {
	overrideStateFilePath = path;
}

function getStateDirPath(): string {
	return join(getStateFilePath(), "..");
}

export function loadPersistedDaemonState(): PersistedDaemonState | null {
	const stateFilePath = getStateFilePath();
	if (!existsSync(stateFilePath)) {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(stateFilePath, "utf-8"));
	} catch {
		backupCorruptState();
		return null;
	}

	if (
		!isObject(parsed) ||
		parsed.version !== 1 ||
		!Array.isArray(parsed.sessions)
	) {
		backupCorruptState();
		return null;
	}

	const sessions: SessionSnapshot[] = [];
	for (const raw of parsed.sessions) {
		if (!isObject(raw)) {
			backupCorruptState();
			return null;
		}
		if (
			typeof raw.name !== "string" ||
			typeof raw.isolated !== "boolean" ||
			typeof raw.activeTabIndex !== "number" ||
			!Array.isArray(raw.tabs) ||
			raw.activeTabIndex < 0 ||
			raw.activeTabIndex >= raw.tabs.length
		) {
			backupCorruptState();
			return null;
		}
		const tabs: TabSnapshot[] = [];
		for (const tab of raw.tabs) {
			if (!isObject(tab) || typeof tab.url !== "string") {
				backupCorruptState();
				return null;
			}
			tabs.push({ url: tab.url });
		}
		sessions.push({
			name: raw.name,
			isolated: raw.isolated,
			activeTabIndex: raw.activeTabIndex,
			tabs,
		});
	}

	return {
		version: 1,
		updatedAt:
			typeof parsed.updatedAt === "string"
				? parsed.updatedAt
				: new Date().toISOString(),
		sessions,
	};
}

export async function persistDaemonState(
	state: PersistedDaemonState,
): Promise<void> {
	const stateDir = getStateDirPath();
	const stateFilePath = getStateFilePath();
	const tempPath = `${stateFilePath}.tmp`;
	mkdirSync(stateDir, { recursive: true });
	await writeFileAsync(tempPath, JSON.stringify(state, null, 2));
	renameSync(tempPath, stateFilePath);
}

function backupCorruptState(): void {
	const stateFilePath = getStateFilePath();
	try {
		const backupPath = `${stateFilePath}.corrupt-${Date.now()}`;
		copyFileSync(stateFilePath, backupPath);
	} catch {
		// best effort
	}
}
