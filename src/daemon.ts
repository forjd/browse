import { chmodSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { type BrowserContext, chromium, type Page } from "playwright";
import { RingBuffer } from "./buffers.ts";
import { handleClick } from "./commands/click.ts";
import { type ConsoleEntry, handleConsole } from "./commands/console.ts";
import { handleFill } from "./commands/fill.ts";
import { handleGoto } from "./commands/goto.ts";
import { handleNetwork, type NetworkEntry } from "./commands/network.ts";
import { handleQuit } from "./commands/quit.ts";
import { handleScreenshot } from "./commands/screenshot.ts";
import { handleSelect } from "./commands/select.ts";
import { handleSnapshot } from "./commands/snapshot.ts";
import { handleText } from "./commands/text.ts";
import {
	cleanupFiles,
	createIdleTimer,
	type IdleTimer,
	type LifecycleConfig,
	writePidFile,
} from "./lifecycle.ts";
import type { Response } from "./protocol.ts";
import { parseRequest, serialiseResponse } from "./protocol.ts";
import { markStale } from "./refs.ts";

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

/**
 * Start a daemon socket server with an injected page.
 * This is the testable core — no browser launch.
 */
export async function startServer(
	page: Page,
	lifecycleConfig: LifecycleConfig,
	onShutdown: () => Promise<void>,
): Promise<{
	server: Server;
	idleTimer: IdleTimer;
	shutdown: () => Promise<void>;
}> {
	let server: Server;
	let idleTimer: IdleTimer;

	async function shutdown() {
		idleTimer.clear();
		server.close();
		await onShutdown();
		cleanupFiles(lifecycleConfig);
	}

	idleTimer = createIdleTimer(lifecycleConfig, () => {
		shutdown();
	});

	// Mark refs as stale when the page navigates
	page.on("framenavigated", (frame) => {
		if (frame === page.mainFrame()) {
			markStale();
		}
	});

	// Console and network buffers
	const consoleBuffer = new RingBuffer<ConsoleEntry>(500);
	const networkBuffer = new RingBuffer<NetworkEntry>(500);

	page.on("console", (msg) => {
		consoleBuffer.push({
			level: msg.type(),
			text: msg.text(),
			location: msg.location(),
			timestamp: Date.now(),
		});
	});

	page.on("response", (response) => {
		networkBuffer.push({
			status: response.status(),
			method: response.request().method(),
			url: response.url(),
			timestamp: Date.now(),
		});
	});

	async function handleConnection(data: string): Promise<string> {
		idleTimer.reset();

		try {
			const request = parseRequest(data);
			let response: Response;

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
					response = handleConsole(consoleBuffer, request.args);
					break;
				case "network":
					response = handleNetwork(networkBuffer, request.args);
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

	writePidFile(lifecycleConfig);

	const { shutdown } = await startServer(page, lifecycleConfig, async () => {
		try {
			await context.close();
		} catch {
			// Browser may already be closed
		}
	});

	return { shutdown };
}
