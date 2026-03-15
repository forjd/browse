import type { BrowserContext, Page } from "playwright";
import type { Response } from "../protocol.ts";
import {
	attachDialogListener,
	createDialogState,
	type DialogState,
} from "./dialog.ts";
import { createInterceptState, type InterceptState } from "./intercept.ts";
import type { TabRegistry, TabState } from "./tab.ts";

export type Session = {
	name: string;
	tabRegistry: TabRegistry;
	/** The browser context for this session */
	context: BrowserContext;
	/** Whether this session uses an isolated browser context */
	isolated: boolean;
	/** Per-session dialog handling state */
	dialogState: DialogState;
	/** Per-session request interception state */
	interceptState: InterceptState;
	/** Callback to attach page listeners to new tabs in this session */
	attachListeners: (page: Page, tabState: TabState) => void;
};

export type SessionRegistry = {
	sessions: Map<string, Session>;
};

export type SessionCallbacks = {
	createSessionTab: (context: BrowserContext) => Promise<TabState>;
	createIsolatedContext: () => Promise<BrowserContext>;
	/** The shared (default) browser context */
	defaultContext: BrowserContext;
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
		default:
			throw new Error(`Unexpected subcommand: ${subcommand}`);
	}
}

function handleList(registry: SessionRegistry): Response {
	if (registry.sessions.size === 0) {
		return { ok: true, data: "No sessions available." };
	}
	const lines: string[] = [];
	for (const [name, session] of registry.sessions) {
		const tabCount = session.tabRegistry.tabs.length;
		const marker = session.isolated ? " [isolated]" : "";
		lines.push(
			`  ${name}${marker} (${tabCount} tab${tabCount !== 1 ? "s" : ""})`,
		);
	}
	return { ok: true, data: lines.join("\n") };
}

async function handleCreate(
	registry: SessionRegistry,
	args: string[],
	callbacks: SessionCallbacks,
): Promise<Response> {
	const name = args[1];
	if (!name || name.startsWith("--")) {
		return {
			ok: false,
			error:
				"Missing session name. Usage: browse session create <name> [--isolated]",
		};
	}

	if (registry.sessions.has(name)) {
		return {
			ok: false,
			error: `Session '${name}' already exists.`,
		};
	}

	const isolated = args.includes("--isolated");
	const sessionContext = isolated
		? await callbacks.createIsolatedContext()
		: callbacks.defaultContext;

	const tabState = await callbacks.createSessionTab(sessionContext);
	callbacks.attachListeners(tabState.page, tabState);

	const dialogState = createDialogState();
	attachDialogListener(tabState.page, dialogState);

	const interceptState = createInterceptState();

	const tabRegistry: TabRegistry = {
		tabs: [tabState],
		activeTabIndex: 0,
	};

	registry.sessions.set(name, {
		name,
		context: sessionContext,
		isolated,
		dialogState,
		interceptState,
		tabRegistry,
		attachListeners: callbacks.attachListeners,
	});

	return {
		ok: true,
		data: `Session '${name}' created${isolated ? " (isolated)" : ""}.`,
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

	// Close the isolated context if this session owns one
	if (session.isolated && session.context) {
		try {
			await session.context.close();
		} catch {
			// Context may already be closed
		}
	}

	registry.sessions.delete(name);

	return {
		ok: true,
		data: `Session '${name}' closed.`,
	};
}
