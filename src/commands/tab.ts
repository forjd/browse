import type { Page } from "playwright";
import type { RingBuffer } from "../buffers.ts";
import type { Response } from "../protocol.ts";
import type { ConsoleEntry } from "./console.ts";
import type { NetworkEntry } from "./network.ts";

export type TabState = {
	page: Page;
	consoleBuffer: RingBuffer<ConsoleEntry>;
	networkBuffer: RingBuffer<NetworkEntry>;
};

export type TabRegistry = {
	tabs: TabState[];
	activeTabIndex: number;
};

export type TabCallbacks = {
	clearRefs: () => void;
	createTab: () => Promise<TabState>;
};

const VALID_SUBCOMMANDS = ["list", "new", "switch", "close"] as const;

export async function handleTab(
	registry: TabRegistry,
	args: string[],
	callbacks: TabCallbacks,
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
			error: `Usage: browse tab <list|new|switch|close>. Valid subcommands: ${VALID_SUBCOMMANDS.join(", ")}.`,
		};
	}

	switch (subcommand) {
		case "list":
			return handleList(registry);
		case "new":
			return handleNew(registry, args, callbacks);
		case "switch":
			return handleSwitch(registry, args, callbacks);
		case "close":
			return handleClose(registry, args, callbacks);
	}
}

async function handleList(registry: TabRegistry): Promise<Response> {
	const lines: string[] = [];

	for (let i = 0; i < registry.tabs.length; i++) {
		const tab = registry.tabs[i];
		const isActive = i === registry.activeTabIndex;
		const title = await tab.page.title();
		const url = tab.page.url();
		const marker = isActive ? " [active]" : "";
		lines.push(`  ${i + 1}.${marker} "${title}" (${url})`);
	}

	return { ok: true, data: lines.join("\n") };
}

async function handleNew(
	registry: TabRegistry,
	args: string[],
	callbacks: TabCallbacks,
): Promise<Response> {
	const url = args[1];

	try {
		const tabState = await callbacks.createTab();
		registry.tabs.push(tabState);
		registry.activeTabIndex = registry.tabs.length - 1;
		callbacks.clearRefs();

		const tabIndex = registry.tabs.length;

		if (url) {
			await tabState.page.goto(url, {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});
			return {
				ok: true,
				data: `Opened tab ${tabIndex}: ${url}`,
			};
		}

		return {
			ok: true,
			data: `Opened tab ${tabIndex} (blank)`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}

async function handleSwitch(
	registry: TabRegistry,
	args: string[],
	callbacks: TabCallbacks,
): Promise<Response> {
	const indexArg = args[1];
	if (!indexArg) {
		return {
			ok: false,
			error: "Missing tab index. Usage: browse tab switch <index>",
		};
	}

	const index = Number.parseInt(indexArg, 10);
	if (Number.isNaN(index)) {
		return {
			ok: false,
			error: `Invalid tab index: ${indexArg}. Must be a number.`,
		};
	}

	if (index < 1 || index > registry.tabs.length) {
		return {
			ok: false,
			error: `Invalid tab index: ${index}. Open tabs: 1–${registry.tabs.length}.`,
		};
	}

	const internalIndex = index - 1;
	registry.activeTabIndex = internalIndex;
	const tab = registry.tabs[internalIndex];
	await tab.page.bringToFront();
	callbacks.clearRefs();

	const title = await tab.page.title();
	const url = tab.page.url();

	return {
		ok: true,
		data: `Switched to tab ${index}: "${title}" (${url})`,
	};
}

async function handleClose(
	registry: TabRegistry,
	args: string[],
	callbacks: TabCallbacks,
): Promise<Response> {
	if (registry.tabs.length === 1) {
		return {
			ok: false,
			error:
				"Cannot close the only open tab. Use 'browse quit' to stop the daemon.",
		};
	}

	let closeIndex: number;

	const indexArg = args[1];
	if (indexArg) {
		const parsed = Number.parseInt(indexArg, 10);
		if (Number.isNaN(parsed) || parsed < 1 || parsed > registry.tabs.length) {
			return {
				ok: false,
				error: `Invalid tab index: ${indexArg}. Open tabs: 1–${registry.tabs.length}.`,
			};
		}
		closeIndex = parsed - 1;
	} else {
		closeIndex = registry.activeTabIndex;
	}

	const closedTab = registry.tabs[closeIndex];
	const closedDisplayIndex = closeIndex + 1;

	await closedTab.page.close();
	registry.tabs.splice(closeIndex, 1);

	// Adjust active index
	if (closeIndex === registry.activeTabIndex) {
		// Closed the active tab — switch to nearest
		registry.activeTabIndex = Math.min(closeIndex, registry.tabs.length - 1);
	} else if (closeIndex < registry.activeTabIndex) {
		// Closed a tab before the active one — adjust index down
		registry.activeTabIndex--;
	}

	callbacks.clearRefs();

	const activeTab = registry.tabs[registry.activeTabIndex];
	const title = await activeTab.page.title();

	return {
		ok: true,
		data: `Closed tab ${closedDisplayIndex}. Active tab is now ${registry.activeTabIndex + 1}: "${title}"`,
	};
}
