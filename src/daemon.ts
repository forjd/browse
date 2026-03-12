import { chmodSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { type BrowserContext, chromium, type Page } from "playwright";
import { handleGoto } from "./commands/goto.ts";
import { handleQuit } from "./commands/quit.ts";
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
