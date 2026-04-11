import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function getStateFilePath(): string {
	return STATE_FILE;
}

export function loadPersistedDaemonState(): PersistedDaemonState | null {
	if (!existsSync(STATE_FILE)) {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
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
			!Array.isArray(raw.tabs)
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

export function persistDaemonState(state: PersistedDaemonState): void {
	mkdirSync(STATE_DIR, { recursive: true });
	writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function backupCorruptState(): void {
	try {
		const backupPath = `${STATE_FILE}.corrupt-${Date.now()}`;
		copyFileSync(STATE_FILE, backupPath);
	} catch {
		// best effort
	}
}
