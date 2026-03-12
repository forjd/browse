import { chmodSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { type BrowserContext, chromium, type Page } from "playwright";
import { RingBuffer } from "./buffers.ts";
import { handleAssert } from "./commands/assert.ts";
import { handleAuthState } from "./commands/auth-state.ts";
import { handleClick } from "./commands/click.ts";
import { type ConsoleEntry, handleConsole } from "./commands/console.ts";
import { handleFill } from "./commands/fill.ts";
import { handleFlow } from "./commands/flow.ts";
import { handleGoto } from "./commands/goto.ts";
import { handleHealthcheck } from "./commands/healthcheck.ts";
import { handleLogin } from "./commands/login.ts";
import { handleNetwork, type NetworkEntry } from "./commands/network.ts";
import { handleQuit } from "./commands/quit.ts";
import { handleScreenshot } from "./commands/screenshot.ts";
import { handleSelect } from "./commands/select.ts";
import { handleSnapshot } from "./commands/snapshot.ts";
import { handleTab, type TabRegistry, type TabState } from "./commands/tab.ts";
import { handleText } from "./commands/text.ts";
import type { BrowseConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import {
	cleanupFiles,
	createIdleTimer,
	type IdleTimer,
	type LifecycleConfig,
	writePidFile,
} from "./lifecycle.ts";
import type { Response } from "./protocol.ts";
import { parseRequest, serialiseResponse } from "./protocol.ts";
import { clearRefs, markStale } from "./refs.ts";

export type DaemonOptions = {
	socketPath: string;
	pidPath: string;
	idleTimeoutMs: number;
	headless?: boolean;
	userDataDir?: string;
};

export type DaemonHandle = {
	shutdown: () => Promise<void>;
};

export type ServerDeps = {
	page: Page;
	context: BrowserContext;
	config: BrowseConfig | null;
};

function attachPageListeners(page: Page, tabState: TabState): void {
	page.on("framenavigated", (frame) => {
		if (frame === page.mainFrame()) {
			markStale();
		}
	});

	page.on("console", (msg) => {
		tabState.consoleBuffer.push({
			level: msg.type(),
			text: msg.text(),
			location: msg.location(),
			timestamp: Date.now(),
		});
	});

	page.on("response", (response) => {
		tabState.networkBuffer.push({
			status: response.status(),
			method: response.request().method(),
			url: response.url(),
			timestamp: Date.now(),
		});
	});
}

/**
 * Start a daemon socket server with injected dependencies.
 * This is the testable core — no browser launch.
 */
export async function startServer(
	deps: ServerDeps,
	lifecycleConfig: LifecycleConfig,
	onShutdown: () => Promise<void>,
): Promise<{
	server: Server;
	idleTimer: IdleTimer;
	shutdown: () => Promise<void>;
}> {
	let server: Server;
	let idleTimer: IdleTimer;

	const { context, config } = deps;

	// Tab registry
	const initialTabState: TabState = {
		page: deps.page,
		consoleBuffer: new RingBuffer<ConsoleEntry>(500),
		networkBuffer: new RingBuffer<NetworkEntry>(500),
	};

	const tabRegistry: TabRegistry = {
		tabs: [initialTabState],
		activeTabIndex: 0,
	};

	// Attach listeners to the initial page
	attachPageListeners(deps.page, initialTabState);

	function getActivePage(): Page {
		return tabRegistry.tabs[tabRegistry.activeTabIndex].page;
	}

	function getActiveConsoleBuffer(): RingBuffer<ConsoleEntry> {
		return tabRegistry.tabs[tabRegistry.activeTabIndex].consoleBuffer;
	}

	function getActiveNetworkBuffer(): RingBuffer<NetworkEntry> {
		return tabRegistry.tabs[tabRegistry.activeTabIndex].networkBuffer;
	}

	async function createTab(): Promise<TabState> {
		const newPage = await context.newPage();
		const tabState: TabState = {
			page: newPage,
			consoleBuffer: new RingBuffer<ConsoleEntry>(500),
			networkBuffer: new RingBuffer<NetworkEntry>(500),
		};
		attachPageListeners(newPage, tabState);
		return tabState;
	}

	async function shutdown() {
		idleTimer.clear();
		server.close();
		await onShutdown();
		cleanupFiles(lifecycleConfig);
	}

	idleTimer = createIdleTimer(lifecycleConfig, () => {
		shutdown();
	});

	async function handleConnection(data: string): Promise<string> {
		idleTimer.reset();

		try {
			const request = parseRequest(data);
			let response: Response;
			const page = getActivePage();

			switch (request.cmd) {
				case "goto":
					response = await handleGoto(page, request.args);
					break;
				case "text":
					response = await handleText(page);
					break;
				case "snapshot":
					response = await handleSnapshot(page, request.args);
					break;
				case "click":
					response = await handleClick(page, request.args);
					break;
				case "fill":
					response = await handleFill(page, request.args);
					break;
				case "select":
					response = await handleSelect(page, request.args);
					break;
				case "screenshot":
					response = await handleScreenshot(page, request.args);
					break;
				case "console":
					response = handleConsole(getActiveConsoleBuffer(), request.args);
					break;
				case "network":
					response = handleNetwork(getActiveNetworkBuffer(), request.args);
					break;
				case "auth-state":
					response = await handleAuthState(context, page, request.args);
					break;
				case "login":
					response = await handleLogin(config, page, request.args);
					break;
				case "tab":
					response = await handleTab(tabRegistry, request.args, {
						clearRefs,
						createTab,
					});
					break;
				case "flow":
					response = await handleFlow(config, page, request.args, {
						consoleBuffer: getActiveConsoleBuffer(),
						networkBuffer: getActiveNetworkBuffer(),
					});
					break;
				case "assert":
					response = await handleAssert(config, page, request.args);
					break;
				case "healthcheck":
					response = await handleHealthcheck(config, page, request.args, {
						consoleBuffer: getActiveConsoleBuffer(),
						networkBuffer: getActiveNetworkBuffer(),
					});
					break;
				case "quit":
					response = await handleQuit();
					setTimeout(() => shutdown(), 50);
					break;
			}

			return serialiseResponse(response);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return serialiseResponse({ ok: false, error: message });
		}
	}

	server = createServer((socket) => {
		let buffer = "";

		socket.on("data", (chunk) => {
			buffer += chunk.toString();

			const newlineIndex = buffer.indexOf("\n");
			if (newlineIndex === -1) return;

			const line = buffer.slice(0, newlineIndex);
			buffer = buffer.slice(newlineIndex + 1);

			handleConnection(line).then(
				(responseStr) => {
					socket.end(responseStr);
				},
				(err) => {
					const errResponse = serialiseResponse({
						ok: false,
						error: err instanceof Error ? err.message : String(err),
					});
					socket.end(errResponse);
				},
			);
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.on("error", reject);
		server.listen(lifecycleConfig.socketPath, () => {
			chmodSync(lifecycleConfig.socketPath, 0o600);
			resolve();
		});
	});

	return { server, idleTimer, shutdown };
}

/**
 * Full daemon startup: launches browser + starts socket server.
 */
export async function startDaemon(
	options: DaemonOptions,
): Promise<DaemonHandle> {
	const lifecycleConfig: LifecycleConfig = {
		pidPath: options.pidPath,
		socketPath: options.socketPath,
		idleTimeoutMs: options.idleTimeoutMs,
	};

	const userDataDir =
		options.userDataDir ?? join(homedir(), ".bun-browse", "user-data");

	const context: BrowserContext = await chromium.launchPersistentContext(
		userDataDir,
		{ headless: options.headless ?? true },
	);

	const page: Page = context.pages()[0] ?? (await context.newPage());

	// Load config from cwd
	const configPath = join(process.cwd(), "browse.config.json");
	const { config, error: configError } = loadConfig(configPath);
	if (configError) {
		console.error(`Warning: ${configError}`);
	}

	writePidFile(lifecycleConfig);

	const { shutdown } = await startServer(
		{ page, context, config },
		lifecycleConfig,
		async () => {
			try {
				await context.close();
			} catch {
				// Browser may already be closed
			}
		},
	);

	return { shutdown };
}
