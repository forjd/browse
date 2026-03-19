import { chmodSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { type BrowserContext, chromium, type Page } from "playwright";
import { cleanupToken, generateToken } from "./auth.ts";
import { RingBuffer } from "./buffers.ts";
import { attachCDPConsoleCapture } from "./cdp-console.ts";
import { handleA11y } from "./commands/a11y.ts";
import { handleAssert } from "./commands/assert.ts";
import { handleAssertAi } from "./commands/assert-ai.ts";
import { handleAttr } from "./commands/attr.ts";
import { handleAuthState } from "./commands/auth-state.ts";
import { handleBack } from "./commands/back.ts";
import { handleBenchmark } from "./commands/benchmark.ts";
import { handleClick } from "./commands/click.ts";
import { type ConsoleEntry, handleConsole } from "./commands/console.ts";
import { handleCookies } from "./commands/cookies.ts";
import {
	attachDialogListener,
	createDialogState,
	handleDialog,
} from "./commands/dialog.ts";
import { handleDiff } from "./commands/diff.ts";
import { handleDownload } from "./commands/download.ts";
import { handleElementCount } from "./commands/element-count.ts";
import { handleEval } from "./commands/eval.ts";
import { handleFill } from "./commands/fill.ts";
import { handleFlow } from "./commands/flow.ts";
import { handleFlowShare } from "./commands/flow-share.ts";
import { handleForm } from "./commands/form.ts";
import { handleForward } from "./commands/forward.ts";
import { handleFrame } from "./commands/frame.ts";
import { handleGoto } from "./commands/goto.ts";
import { handleHealthcheck } from "./commands/healthcheck.ts";
import { handleHover } from "./commands/hover.ts";
import { handleHtml } from "./commands/html.ts";
import { handleInit } from "./commands/init.ts";
import { createInterceptState, handleIntercept } from "./commands/intercept.ts";
import { handleLogin } from "./commands/login.ts";
import { handleNetwork, type NetworkEntry } from "./commands/network.ts";
import { handlePageEval } from "./commands/page-eval.ts";
import { handlePdf } from "./commands/pdf.ts";
import { handlePress } from "./commands/press.ts";
import { handleQuit } from "./commands/quit.ts";
import { handleReload } from "./commands/reload.ts";
import { handleReplay } from "./commands/replay.ts";
import { handleReport } from "./commands/report.ts";
import { handleScreenshot } from "./commands/screenshot.ts";
import { handleScreenshots } from "./commands/screenshots.ts";
import { handleScroll } from "./commands/scroll.ts";
import { handleSelect } from "./commands/select.ts";
import {
	handleSession,
	type Session,
	type SessionRegistry,
} from "./commands/session.ts";
import { handleSnapshot } from "./commands/snapshot.ts";
import { handleStorage } from "./commands/storage.ts";
import { handleTab, type TabRegistry, type TabState } from "./commands/tab.ts";
import { handleTestMatrix } from "./commands/test-matrix.ts";
import { handleText } from "./commands/text.ts";
import { handleTitle } from "./commands/title.ts";
import { createTraceState, handleTrace } from "./commands/trace.ts";
import { handleUpload } from "./commands/upload.ts";
import { handleUrl } from "./commands/url.ts";
import { handleViewport } from "./commands/viewport.ts";
import { handleWait } from "./commands/wait.ts";
import { handleWipe } from "./commands/wipe.ts";
import { generateCompletions } from "./completions.ts";
import type { BrowseConfig } from "./config.ts";
import { loadConfig, resolveConfigPath } from "./config.ts";
import { checkUnknownFlags, unknownFlagsError } from "./flags.ts";
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
import {
	applyStealthScripts,
	generateUserAgent,
	stealthArgs,
} from "./stealth.ts";
import { resolveTimeout, withTimeout } from "./timeout.ts";

/**
 * Known flags per command. Commands not listed here skip flag validation
 * (e.g. eval/page-eval/fill/select where all args form freeform data).
 */
const KNOWN_FLAGS: Record<string, string[]> = {
	goto: ["--viewport", "--device", "--preset", "--auto-snapshot"],
	text: [],
	snapshot: ["--json", "-i", "-f"],
	click: ["--auto-snapshot"],
	hover: ["--duration"],
	screenshot: ["--viewport", "--selector", "--diff", "--threshold"],
	console: ["--level", "--keep", "--json"],
	network: ["--all", "--keep", "--json"],
	"auth-state": [],
	login: ["--env"],
	tab: [],
	flow: ["--var", "--continue-on-error", "--reporter", "--dry-run", "--stream"],
	assert: ["--var", "--json"],
	healthcheck: [
		"--var",
		"--no-screenshots",
		"--reporter",
		"--parallel",
		"--concurrency",
	],
	wipe: [],
	benchmark: ["--iterations"],
	viewport: ["--device", "--preset"],
	scroll: [],
	press: ["--auto-snapshot"],
	wait: [],
	url: [],
	back: [],
	forward: [],
	reload: ["--hard"],
	attr: [],
	upload: [],
	a11y: ["--standard", "--json", "--include", "--exclude"],
	quit: [],
	session: ["--isolated"],
	ping: [],
	status: ["--watch", "--interval", "--exit-code"],
	dialog: [],
	download: [
		"--save-to",
		"--expect-type",
		"--expect-min-size",
		"--expect-max-size",
	],
	frame: [],
	intercept: ["--status", "--body", "--content-type"],
	cookies: ["--domain", "--json"],
	storage: ["--json"],
	html: [],
	title: [],
	pdf: [],
	"element-count": [],
	trace: ["--screenshots", "--snapshots", "--out", "--port", "--latest"],
	init: ["--force"],
	screenshots: ["--older-than", "--dry-run"],
	report: ["--out", "--title", "--screenshots"],
	completions: [],
	form: ["--data", "--auto-snapshot"],
	"test-matrix": ["--roles", "--flow", "--env", "--reporter"],
	"assert-ai": ["--model", "--provider", "--base-url"],
	replay: ["--out"],
	diff: [
		"--baseline",
		"--current",
		"--flow",
		"--threshold",
		"--var",
		"--no-screenshots",
	],
	"flow-share": [],
};

export type DaemonOptions = {
	socketPath: string;
	pidPath: string;
	idleTimeoutMs: number;
	headless?: boolean;
	userDataDir?: string;
	configPath?: string;
	/** Optional TCP listen address, e.g. "tcp://0.0.0.0:9222" */
	tcpListen?: string;
};

export type DaemonHandle = {
	shutdown: () => Promise<void>;
};

export type StealthOpts = {
	userAgent: string;
	navigatorPlatform: string;
	chromeMajor: string;
};

export type ServerDeps = {
	page: Page;
	context: BrowserContext;
	config: BrowseConfig | null;
	/** Validation error when config file exists but is invalid. */
	configError?: string | null;
	stealthOpts?: StealthOpts;
	token?: string;
	/** Optional TCP listen address, e.g. "tcp://0.0.0.0:9222" */
	tcpListen?: string;
};

function attachPageListeners(page: Page, tabState: TabState): void {
	page.on("framenavigated", (frame) => {
		if (frame === page.mainFrame()) {
			markStale();
		}
	});

	// Console capture via CDP — Patchright omits the Runtime.enable call
	// that standard Playwright makes, silently dropping all
	// Runtime.consoleAPICalled events. attachCDPConsoleCapture opens its
	// own CDP session with Runtime + Log enabled so user-triggered
	// console.log/warn/error messages are captured reliably.
	attachCDPConsoleCapture(page, tabState.consoleBuffer).catch(() => {
		// Fallback: if CDP session fails, use Playwright's (partial) listener
		page.on("console", (msg) => {
			tabState.consoleBuffer.push({
				level: msg.type(),
				text: msg.text(),
				location: msg.location(),
				timestamp: Date.now(),
			});
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
export type ServerOptions = {
	/** Called after shutdown completes (quit or idle timeout). Defaults to process.exit(0). */
	onExit?: () => void;
};

export async function startServer(
	deps: ServerDeps,
	lifecycleConfig: LifecycleConfig,
	onShutdown: () => Promise<void>,
	options?: ServerOptions,
): Promise<{
	server: Server;
	idleTimer: IdleTimer;
	shutdown: () => Promise<void>;
}> {
	let server: Server;
	let idleTimer: IdleTimer;

	const { context, config, configError, stealthOpts, token, tcpListen } = deps;
	const configCtx = configError ? { configError } : undefined;
	const exitFn = options?.onExit ?? (() => process.exit(0));
	const startTime = Date.now();

	// Per-context trace state so each BrowserContext has isolated tracing
	const traceStates = new Map<
		BrowserContext,
		ReturnType<typeof createTraceState>
	>();
	function getTraceState(ctx: BrowserContext) {
		let state = traceStates.get(ctx);
		if (!state) {
			state = createTraceState();
			traceStates.set(ctx, state);
		}
		return state;
	}

	// Tab registry for default session
	const initialTabState: TabState = {
		page: deps.page,
		consoleBuffer: new RingBuffer<ConsoleEntry>(500),
		networkBuffer: new RingBuffer<NetworkEntry>(500),
	};

	const defaultTabRegistry: TabRegistry = {
		tabs: [initialTabState],
		activeTabIndex: 0,
	};

	// Attach listeners to the initial page
	attachPageListeners(deps.page, initialTabState);

	// Dialog handling state for default session
	const defaultDialogState = createDialogState();
	attachDialogListener(deps.page, defaultDialogState);

	// Request interception state for default session
	const defaultInterceptState = createInterceptState();

	// Session registry — default session is always present
	const sessionRegistry: SessionRegistry = {
		sessions: new Map<string, Session>(),
	};

	const defaultSession: Session = {
		name: "default",
		context,
		isolated: false,
		dialogState: defaultDialogState,
		interceptState: defaultInterceptState,
		tabRegistry: defaultTabRegistry,
		attachListeners: attachPageListeners,
	};
	sessionRegistry.sessions.set("default", defaultSession);

	/** Resolve which session to use for a request */
	function resolveSession(sessionName?: string): Session | { error: string } {
		const name = sessionName ?? "default";
		const session = sessionRegistry.sessions.get(name);
		if (!session) {
			return { error: `Session '${name}' not found.` };
		}
		return session;
	}

	function getActivePage(session: Session): Page {
		return session.tabRegistry.tabs[session.tabRegistry.activeTabIndex].page;
	}

	function getActiveTabState(session: Session): TabState {
		return session.tabRegistry.tabs[session.tabRegistry.activeTabIndex];
	}

	function getActiveConsoleBuffer(session: Session): RingBuffer<ConsoleEntry> {
		return session.tabRegistry.tabs[session.tabRegistry.activeTabIndex]
			.consoleBuffer;
	}

	function getActiveNetworkBuffer(session: Session): RingBuffer<NetworkEntry> {
		return session.tabRegistry.tabs[session.tabRegistry.activeTabIndex]
			.networkBuffer;
	}

	async function createTab(targetContext: BrowserContext): Promise<TabState> {
		const newPage = await targetContext.newPage();
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
		tcpServer?.close();
		await onShutdown();
		cleanupFiles(lifecycleConfig);
	}

	let shutdownStarted = false;
	function shutdownOnce() {
		if (shutdownStarted) return;
		shutdownStarted = true;
		shutdown()
			.catch(() => cleanupFiles(lifecycleConfig))
			.finally(exitFn);
	}

	idleTimer = createIdleTimer(lifecycleConfig, () => {
		shutdownOnce();
	});

	// Commands exempt from timeout
	const TIMEOUT_EXEMPT = new Set([
		"quit",
		"benchmark",
		"session",
		"ping",
		"status",
		"trace",
		"init",
		"screenshots",
		"report",
		"completions",
		"replay",
		"flow-share",
		"test-matrix",
		"diff",
	]);

	type ConnectionResult = { responseStr: string; quit: boolean };
	function reply(responseStr: string, quit = false): ConnectionResult {
		return { responseStr, quit };
	}

	async function handleConnection(data: string): Promise<ConnectionResult> {
		idleTimer.reset();

		try {
			const request = parseRequest(data);

			// Validate auth token if the daemon has one
			if (token && request.token !== token) {
				return reply(
					serialiseResponse({
						ok: false,
						error: "Authentication failed: invalid or missing token.",
					}),
				);
			}

			// Session management commands are handled globally
			if (request.cmd === "session") {
				const response = await handleSession(sessionRegistry, request.args, {
					createSessionTab: (targetContext) => createTab(targetContext),
					createIsolatedContext: async () => {
						const browser = context.browser();
						if (!browser) {
							throw new Error("Browser not available for isolated context");
						}
						const contextOpts: Record<string, unknown> = {
							viewport: { width: 1440, height: 900 },
						};
						if (stealthOpts) {
							contextOpts.userAgent = stealthOpts.userAgent;
						}
						const isolatedContext = await browser.newContext(contextOpts);
						if (stealthOpts) {
							await applyStealthScripts(isolatedContext, stealthOpts);
						}
						return isolatedContext;
					},
					defaultContext: context,
					attachListeners: attachPageListeners,
				});
				return reply(serialiseResponse(response));
			}

			// Ping/status don't need session routing
			if (request.cmd === "ping") {
				return reply(serialiseResponse({ ok: true, data: "pong" }));
			}

			if (request.cmd === "status") {
				const uptimeMs = Date.now() - startTime;
				const uptimeSec = Math.floor(uptimeMs / 1000);
				const memUsage = process.memoryUsage();
				const memMb = Math.round(memUsage.rss / 1024 / 1024);

				// Collect session details
				const sessionsInfo: Record<
					string,
					{ url: string; tabs: number; isolated: boolean }
				> = {};
				let totalTabs = 0;
				for (const [name, session] of sessionRegistry.sessions) {
					const tabCount = session.tabRegistry.tabs.length;
					totalTabs += tabCount;
					const page = getActivePage(session);
					const url = page?.url() ?? "<no page>";
					sessionsInfo[name] = {
						url,
						tabs: tabCount,
						isolated: session.isolated,
					};
				}

				// Get browser version
				let browserVersion = "unknown";
				let _chromiumPid: number | undefined;
				try {
					const browser = context.browser();
					if (browser) {
						browserVersion = browser.version();
					}
				} catch {
					// Browser info unavailable
				}

				if (request.json) {
					const jsonData = {
						uptime: uptimeSec,
						uptimeMs,
						memory: {
							rss: memUsage.rss,
							heapUsed: memUsage.heapUsed,
							heapTotal: memUsage.heapTotal,
							rssMb: memMb,
						},
						sessions: sessionRegistry.sessions.size,
						totalTabs,
						browserVersion,
						daemonPid: process.pid,
						sessionsDetail: sessionsInfo,
					};
					return reply(
						serialiseResponse({
							ok: true,
							data: JSON.stringify(jsonData, null, 2),
						}),
					);
				}

				const statusData = [
					`Daemon PID: ${process.pid}`,
					`Uptime: ${uptimeSec}s`,
					`Memory: ${memMb} MB`,
					`Browser: Chromium ${browserVersion}`,
					`Sessions: ${sessionRegistry.sessions.size}`,
					`Total tabs: ${totalTabs}`,
					"",
				];
				for (const [name, info] of Object.entries(sessionsInfo)) {
					statusData.push(
						`  ${name}: ${info.url} (${info.tabs} tab${info.tabs !== 1 ? "s" : ""}${info.isolated ? ", isolated" : ""})`,
					);
				}
				return reply(
					serialiseResponse({
						ok: true,
						data: statusData.join("\n"),
					}),
				);
			}

			// Resolve session for this request
			const session = resolveSession(request.session);
			if ("error" in session) {
				return reply(
					serialiseResponse({
						ok: false,
						error: session.error,
					}),
				);
			}

			const page = getActivePage(session);
			const activeTabState = getActiveTabState(session);
			const tabRegistry = session.tabRegistry;
			const sessionContext = session.context;

			// Reject unknown flags before dispatching
			const knownFlags = KNOWN_FLAGS[request.cmd];
			if (knownFlags) {
				const unknown = checkUnknownFlags(request.args, knownFlags);
				if (unknown.length > 0) {
					return reply(
						serialiseResponse({
							ok: false,
							error: unknownFlagsError(request.cmd, unknown),
						}),
					);
				}
			}

			async function executeCommand(): Promise<Response> {
				switch (request.cmd) {
					case "goto":
						return handleGoto(page, request.args, {
							autoSnapshot: request.args.includes("--auto-snapshot"),
						});
					case "text":
						return handleText(page);
					case "snapshot":
						return handleSnapshot(page, request.args, {
							json: request.json,
						});
					case "click":
						return handleClick(page, request.args, {
							autoSnapshot: request.args.includes("--auto-snapshot"),
						});
					case "hover":
						return handleHover(page, request.args);
					case "fill":
						return handleFill(page, request.args);
					case "select":
						return handleSelect(page, request.args);
					case "scroll":
						return handleScroll(page, request.args);
					case "press":
						return handlePress(page, request.args, {
							autoSnapshot: request.args.includes("--auto-snapshot"),
						});
					case "screenshot":
						return handleScreenshot(page, request.args);
					case "console":
						return handleConsole(
							getActiveConsoleBuffer(session),
							request.args,
							{
								json: request.json,
							},
						);
					case "network":
						return handleNetwork(
							getActiveNetworkBuffer(session),
							request.args,
							{
								json: request.json,
							},
						);
					case "auth-state":
						return handleAuthState(sessionContext, page, request.args);
					case "login":
						return handleLogin(config, page, request.args, configCtx);
					case "tab":
						return handleTab(tabRegistry, request.args, {
							clearRefs,
							createTab: () => createTab(sessionContext),
						});
					case "flow":
						return handleFlow(
							config,
							page,
							request.args,
							{
								consoleBuffer: getActiveConsoleBuffer(session),
								networkBuffer: getActiveNetworkBuffer(session),
							},
							configCtx,
						);
					case "assert":
						return handleAssert(config, page, request.args);
					case "healthcheck":
						return handleHealthcheck(
							config,
							page,
							request.args,
							{
								consoleBuffer: getActiveConsoleBuffer(session),
								networkBuffer: getActiveNetworkBuffer(session),
							},
							sessionContext,
							configCtx,
						);
					case "wipe":
						return handleWipe({
							context: sessionContext,
							tabRegistry,
							clearRefs,
						});
					case "viewport":
						return handleViewport(page, request.args);
					case "eval":
						return handleEval(page, request.args);
					case "page-eval":
						return handlePageEval(page, request.args);
					case "wait":
						return handleWait(page, request.args);
					case "url":
						return handleUrl(page);
					case "back":
						return handleBack(page);
					case "forward":
						return handleForward(page);
					case "reload":
						return handleReload(page, request.args);
					case "attr":
						return handleAttr(page, request.args);
					case "upload":
						return handleUpload(page, request.args);
					case "a11y":
						return handleA11y(page, request.args, undefined, {
							json: request.json,
						});
					case "benchmark":
						return handleBenchmark({ context: sessionContext }, request.args);
					case "dialog":
						return handleDialog(session.dialogState, request.args);
					case "download":
						return handleDownload(page, request.args, request.timeout);
					case "frame":
						return handleFrame(page, request.args, activeTabState);
					case "intercept":
						return handleIntercept(page, request.args, session.interceptState);
					case "cookies":
						return handleCookies(sessionContext, request.args, {
							json: request.json,
						});
					case "storage":
						return handleStorage(page, request.args, {
							json: request.json,
						});
					case "html":
						return handleHtml(page, request.args);
					case "title":
						return handleTitle(page);
					case "pdf":
						return handlePdf(page, request.args);
					case "element-count":
						return handleElementCount(page, request.args);
					case "trace":
						return handleTrace(
							sessionContext,
							getTraceState(sessionContext),
							request.args,
						);
					case "init":
						return handleInit(request.args);
					case "screenshots":
						return handleScreenshots(request.args);
					case "report":
						return handleReport(request.args);
					case "completions": {
						const shell = request.args[0] ?? "bash";
						const script = generateCompletions(shell);
						if (script) {
							return { ok: true, data: script };
						}
						return {
							ok: false,
							error: `Unknown shell: '${shell}'. Supported: bash, zsh, fish`,
						};
					}
					case "form":
						return handleForm(page, request.args);
					case "test-matrix":
						return handleTestMatrix(
							config,
							page,
							request.args,
							{
								consoleBuffer: getActiveConsoleBuffer(session),
								networkBuffer: getActiveNetworkBuffer(session),
							},
							sessionContext,
							context,
							stealthOpts,
							configCtx,
						);
					case "assert-ai":
						return handleAssertAi(page, request.args);
					case "replay":
						return handleReplay(request.args);
					case "diff":
						return handleDiff(
							config,
							page,
							request.args,
							{
								consoleBuffer: getActiveConsoleBuffer(session),
								networkBuffer: getActiveNetworkBuffer(session),
							},
							sessionContext,
						);
					case "flow-share":
						return handleFlowShare(config, request.args);
					case "quit":
						return handleQuit();
					default:
						return {
							ok: false,
							error: `Command '${request.cmd}' is not yet implemented.`,
						};
				}
			}

			let response: Response;
			if (TIMEOUT_EXEMPT.has(request.cmd)) {
				response = await executeCommand();
			} else {
				const timeoutMs = resolveTimeout(request.timeout, config?.timeout);
				response = await withTimeout(executeCommand, timeoutMs);
			}

			return reply(serialiseResponse(response), request.cmd === "quit");
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return reply(serialiseResponse({ ok: false, error: message }));
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
				(result) => {
					socket.end(result.responseStr, () => {
						if (result.quit) shutdownOnce();
					});
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

	// Verify socket permissions on startup
	try {
		const stats = statSync(lifecycleConfig.socketPath);
		if ((stats.mode & 0o777) !== 0o600) {
			chmodSync(lifecycleConfig.socketPath, 0o600);
		}
	} catch {
		// Socket file may not be accessible — continue
	}

	// Optional TCP transport — allows remote agents to connect over the network
	let tcpServer: Server | undefined;
	if (tcpListen) {
		const match = tcpListen.match(/^tcp:\/\/([^:]+):(\d+)$/);
		if (!match) {
			throw new Error(
				`Invalid tcpListen: '${tcpListen}'; expected 'tcp://host:port'`,
			);
		}
		{
			const [, host, portStr] = match;
			const port = Number.parseInt(portStr, 10);

			tcpServer = createServer((socket) => {
				let tcpBuffer = "";
				socket.on("data", (chunk) => {
					tcpBuffer += chunk.toString();
					const newlineIndex = tcpBuffer.indexOf("\n");
					if (newlineIndex === -1) return;

					const line = tcpBuffer.slice(0, newlineIndex);
					tcpBuffer = tcpBuffer.slice(newlineIndex + 1);

					handleConnection(line).then(
						(result) => {
							socket.end(result.responseStr, () => {
								if (result.quit) shutdownOnce();
							});
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
				tcpServer?.on("error", (err) => {
					// TCP bind failed — roll back the already-open Unix socket
					server.close();
					reject(err);
				});
				tcpServer?.listen(port, host, () => {
					resolve();
				});
			});
		}
	}

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

	const { userAgent, navigatorPlatform, chromeMajor } = generateUserAgent();

	const context: BrowserContext = await chromium.launchPersistentContext(
		userDataDir,
		{
			headless: options.headless ?? true,
			channel: "chrome",
			args: stealthArgs(),
			ignoreDefaultArgs: ["--enable-automation"],
			viewport: { width: 1440, height: 900 },
			userAgent,
		},
	);

	await applyStealthScripts(context, {
		userAgent,
		navigatorPlatform,
		chromeMajor,
	});

	const page: Page = context.pages()[0] ?? (await context.newPage());

	// Browser crash detection — clean exit so CLI cold-starts a fresh daemon
	context.browser()?.on("disconnected", () => {
		process.stderr.write("Browser disconnected — daemon exiting.\n");
		cleanupFiles(lifecycleConfig);
		cleanupToken();
		process.exit(1);
	});

	// Load config: explicit path > upward search > global fallback
	const resolvedConfigPath = resolveConfigPath(options.configPath);
	let config: BrowseConfig | null = null;
	let configError: string | null = null;
	if (resolvedConfigPath) {
		const { config: loaded, error: loadError } = loadConfig(resolvedConfigPath);
		config = loaded;
		configError = loadError;
		if (loadError) {
			console.error(`Warning: ${loadError}`);
		}
	}

	writePidFile(lifecycleConfig);

	// Generate auth token for socket security
	const token = generateToken();

	const { shutdown } = await startServer(
		{
			page,
			context,
			config,
			configError,
			stealthOpts: { userAgent, navigatorPlatform, chromeMajor },
			token,
			tcpListen: options.tcpListen,
		},
		lifecycleConfig,
		async () => {
			cleanupToken();
			try {
				await context.close();
			} catch {
				// Browser may already be closed
			}
			// Remove Chrome's SingletonLock — left behind if the browser
			// doesn't shut down cleanly, blocking subsequent launches.
			try {
				rmSync(join(userDataDir, "SingletonLock"), { force: true });
			} catch {
				// Best effort
			}
		},
	);

	// Graceful signal handling — clean up PID/socket and close browser on
	// SIGTERM/SIGINT so that CI runners and interactive Ctrl-C don't leave
	// orphaned files or zombie browser processes.
	let shuttingDown = false;
	const graceful = async () => {
		if (shuttingDown) return;
		shuttingDown = true;
		try {
			await shutdown();
		} catch {
			// Best-effort cleanup
			cleanupFiles(lifecycleConfig);
			cleanupToken();
		}
		process.exit(0);
	};

	process.on("SIGTERM", graceful);
	process.on("SIGINT", graceful);

	return { shutdown };
}
