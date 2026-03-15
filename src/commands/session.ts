import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import type { TabRegistry, TabState } from "./tab.ts";

export type Session = {
	name: string;
	tabRegistry: TabRegistry;
	/** Callback to attach page listeners to new tabs in this session */
	attachListeners: (page: Page, tabState: TabState) => void;
};

export type SessionRegistry = {
	sessions: Map<string, Session>;
};

export type SessionCallbacks = {
	createSessionTab: () => Promise<TabState>;
	attachListeners: (page: Page, tabState: TabState) => void;
};

const VALID_SUBCOMMANDS = ["list", "create", "close"] as const;

export async function handleSession(
	registry: SessionRegistry,
	args: string[],
	callbacks: SessionCallbacks,
): Promise<Response> {
	const subcommand = args[0];

	if (
		!subcommand ||
		!VALID_SUBCOMMANDS.includes(
			subcommand as (typeof VALID_SUBCOMMANDS)[number],
		)
	) {
		return {
			ok: false,
			error: `Usage: browse session <list|create|close>. Valid subcommands: ${VALID_SUBCOMMANDS.join(", ")}.`,
		};
	}

	switch (subcommand) {
		case "list":
			return handleList(registry);
		case "create":
			return handleCreate(registry, args, callbacks);
		case "close":
			return handleClose(registry, args);
	}
}

function handleList(registry: SessionRegistry): Response {
	const lines: string[] = [];
	for (const [name, session] of registry.sessions) {
		const tabCount = session.tabRegistry.tabs.length;
		lines.push(`  ${name} (${tabCount} tab${tabCount !== 1 ? "s" : ""})`);
	}
	return { ok: true, data: lines.join("\n") };
}

async function handleCreate(
	registry: SessionRegistry,
	args: string[],
	callbacks: SessionCallbacks,
): Promise<Response> {
	const name = args[1];
	if (!name) {
		return {
			ok: false,
			error: "Missing session name. Usage: browse session create <name>",
		};
	}

	if (registry.sessions.has(name)) {
		return {
			ok: false,
			error: `Session '${name}' already exists.`,
		};
	}

	const tabState = await callbacks.createSessionTab();
	callbacks.attachListeners(tabState.page, tabState);

	const tabRegistry: TabRegistry = {
		tabs: [tabState],
		activeTabIndex: 0,
	};

	registry.sessions.set(name, {
		name,
		tabRegistry,
		attachListeners: callbacks.attachListeners,
	});

	return {
		ok: true,
		data: `Session '${name}' created.`,
	};
}

async function handleClose(
	registry: SessionRegistry,
	args: string[],
): Promise<Response> {
	const name = args[1];
	if (!name) {
		return {
			ok: false,
			error: "Missing session name. Usage: browse session close <name>",
		};
	}

	if (name === "default") {
		return {
			ok: false,
			error: "Cannot close the default session.",
		};
	}

	const session = registry.sessions.get(name);
	if (!session) {
		return {
			ok: false,
			error: `Session '${name}' not found.`,
		};
	}

	// Close all pages in the session
	for (const tab of session.tabRegistry.tabs) {
		try {
			await tab.page.close();
		} catch {
			// Page may already be closed
		}
	}

	registry.sessions.delete(name);

	return {
		ok: true,
		data: `Session '${name}' closed.`,
	};
}
