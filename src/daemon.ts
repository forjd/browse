import { randomUUID } from "node:crypto";
import { chmodSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	type BrowserContext,
	type BrowserType,
	chromium,
	firefox,
	type Page,
	webkit,
} from "playwright";
import { cleanupToken, generateToken } from "./auth.ts";
import { RingBuffer } from "./buffers.ts";
import { attachCDPConsoleCapture } from "./cdp-console.ts";
import { handleA11y } from "./commands/a11y.ts";
import { handleApiAssert as handleApiAssertCmd } from "./commands/api-assert.ts";
import { handleAssert } from "./commands/assert.ts";
import { handleAssertAi } from "./commands/assert-ai.ts";
import { handleAttr } from "./commands/attr.ts";
import { handleAuthState } from "./commands/auth-state.ts";
import { handleBack } from "./commands/back.ts";
import { handleBenchmark } from "./commands/benchmark.ts";
import { handleCiInit } from "./commands/ci-init.ts";
import { handleClick } from "./commands/click.ts";
import { handleCompliance } from "./commands/compliance.ts";
import { type ConsoleEntry, handleConsole } from "./commands/console.ts";
import { handleCookies } from "./commands/cookies.ts";
import { handleCrawl } from "./commands/crawl.ts";
import { handleDesignAudit } from "./commands/design-audit.ts";
import { handleDev } from "./commands/dev.ts";
import { handleDevices } from "./commands/devices.ts";
import {
	attachDialogListener,
	createDialogState,
	handleDialog,
} from "./commands/dialog.ts";
import { handleDiff } from "./commands/diff.ts";
import { handleDo } from "./commands/do.ts";
import { handleDocCapture } from "./commands/doc-capture.ts";
import { handleDownload } from "./commands/download.ts";
import { handleElementCount } from "./commands/element-count.ts";
import { handleEval } from "./commands/eval.ts";
import { handleExtract } from "./commands/extract.ts";
import { handleFill } from "./commands/fill.ts";
import { handleFlow } from "./commands/flow.ts";
import { handleFlowShare } from "./commands/flow-share.ts";
import { handleForm } from "./commands/form.ts";
import { handleForward } from "./commands/forward.ts";
import { handleFrame } from "./commands/frame.ts";
import { handleGesture } from "./commands/gesture.ts";
import { handleGoto } from "./commands/goto.ts";
import { handleHealthcheck } from "./commands/healthcheck.ts";
import { handleHover } from "./commands/hover.ts";
import { handleHtml } from "./commands/html.ts";
import { handleI18n } from "./commands/i18n.ts";
import { handleInit } from "./commands/init.ts";
import { createInterceptState, handleIntercept } from "./commands/intercept.ts";
import { handleLogin } from "./commands/login.ts";
import { handleMonitor } from "./commands/monitor.ts";
import { handleNetwork, type NetworkEntry } from "./commands/network.ts";
import { handleOffline } from "./commands/offline.ts";
import { handlePageEval } from "./commands/page-eval.ts";
import { handlePdf } from "./commands/pdf.ts";
import { handlePerf } from "./commands/perf.ts";
import { handlePress } from "./commands/press.ts";
import { handleQuit } from "./commands/quit.ts";
import { handleRecord } from "./commands/record.ts";
import { handleReload } from "./commands/reload.ts";
import { handleRepl } from "./commands/repl.ts";
import { handleReplay } from "./commands/replay.ts";
import { handleReport } from "./commands/report.ts";
import { handleResponsive } from "./commands/responsive.ts";
import { handleScreenshot } from "./commands/screenshot.ts";
import { handleScreenshots } from "./commands/screenshots.ts";
import { handleScroll } from "./commands/scroll.ts";
import { handleSecurity } from "./commands/security.ts";
import { handleSecurityScan } from "./commands/security-scan.ts";
import { handleSelect } from "./commands/select.ts";
import { handleSeo } from "./commands/seo.ts";
import {
	handleSession,
	type Session,
	type SessionRegistry,
} from "./commands/session.ts";
import { handleSnapshot } from "./commands/snapshot.ts";
import { handleStorage } from "./commands/storage.ts";
import { handleSubscribe } from "./commands/subscribe.ts";
import { handleTab, type TabRegistry, type TabState } from "./commands/tab.ts";
import { handleTestMatrix } from "./commands/test-matrix.ts";
import { handleText } from "./commands/text.ts";
import { handleThrottle } from "./commands/throttle.ts";
import { handleTitle } from "./commands/title.ts";
import { createTraceState, handleTrace } from "./commands/trace.ts";
import { handleUpload } from "./commands/upload.ts";
import { handleUrl } from "./commands/url.ts";
import { createVideoState, handleVideo } from "./commands/video.ts";
import { handleViewport } from "./commands/viewport.ts";
import { handleVrt } from "./commands/vrt.ts";
import { handleWait } from "./commands/wait.ts";
import { handleWatch } from "./commands/watch.ts";
import { handleWipe } from "./commands/wipe.ts";
import { generateCompletions } from "./completions.ts";
import type { BrowseConfig, BrowserName, ProxyConfig } from "./config.ts";
import { loadConfig, resolveConfigPath } from "./config.ts";
import { checkUnknownFlags, unknownFlagsError } from "./flags.ts";
import type { FlowSource } from "./flow-loader.ts";
import {
	discoverFlowDirectories,
	loadFlowsFromDirectories,
	mergeFlows,
} from "./flow-loader.ts";
import {
	cleanupFiles,
	createIdleTimer,
	type IdleTimer,
	type LifecycleConfig,
	writePidFile,
} from "./lifecycle.ts";
import { createLogger } from "./logger.ts";
import type { CommandContext } from "./plugin.ts";
import {
	createEmptyRegistry,
	discoverPluginPaths,
	getPluginSessionState,
	loadPlugins,
	type PluginRegistry,
	runAfterHooks,
	runBeforeHooks,
	runCleanupHooks,
} from "./plugin-loader.ts";
import type { Response } from "./protocol.ts";
import {
	BUILTIN_COMMANDS,
	parseRequest,
	serialiseResponse,
} from "./protocol.ts";
import { clearRefs, markStale } from "./refs.ts";
import {
	loadPersistedDaemonState,
	persistDaemonState,
} from "./session-state.ts";
import {
	applyStealthScripts,
	buildStealthUA,
	type StealthOpts,
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
	flow: [
		"--var",
		"--continue-on-error",
		"--reporter",
		"--dry-run",
		"--stream",
		"--webhook",
	],
	assert: ["--var", "--json"],
	healthcheck: [
		"--var",
		"--no-screenshots",
		"--reporter",
		"--parallel",
		"--concurrency",
		"--webhook",
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
	status: ["--watch", "--interval", "--exit-code", "--metrics"],
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
	video: ["--size", "--out"],
	perf: ["--budget", "--json"],
	security: ["--json"],
	responsive: ["--breakpoints", "--url", "--out", "--json"],
	extract: ["--filter", "--attr", "--csv", "--json"],
	record: ["--output", "--name"],
	throttle: ["--download", "--upload", "--latency"],
	offline: [],
	crawl: [
		"--depth",
		"--extract",
		"--paginate",
		"--max-pages",
		"--rate-limit",
		"--output",
		"--include",
		"--exclude",
		"--same-origin",
		"--dry-run",
		"--robots",
		"--json",
	],
	do: [
		"--dry-run",
		"--provider",
		"--model",
		"--base-url",
		"--verbose",
		"--env",
	],
	vrt: ["--url", "--threshold", "--all", "--only", "--json"],
	"ci-init": ["--ci", "--force"],
	watch: ["--var"],
	repl: [],
	seo: ["--check", "--score", "--json"],
	subscribe: ["--events", "--level", "--status", "--idle-timeout"],
	dev: ["--flow"],
	compliance: ["--standard", "--check", "--json"],
	"security-scan": ["--checks", "--verbose", "--json"],
	i18n: ["--locales", "--url", "--pattern", "--locale", "--json"],
	"api-assert": [
		"--status",
		"--method",
		"--schema",
		"--timing",
		"--body-contains",
		"--body-not-contains",
		"--max-size",
		"--header",
		"--json",
	],
	"design-audit": ["--tokens", "--check", "--selector", "--extract", "--json"],
	"doc-capture": [
		"--flow",
		"--output",
		"--markdown",
		"--update",
		"--var",
		"--json",
	],
	gesture: ["--speed", "--duration", "--distance", "--to"],
	devices: [],
	monitor: ["--config", "--last", "--site", "--json"],
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
	/** Browser engine to use: "chrome" (default), "firefox", or "webkit". */
	browser?: BrowserName;
	/** Proxy server URL, e.g. "http://proxy:8080" or "socks5://proxy:1080". */
	proxy?: string;
};

export type DaemonHandle = {
	shutdown: () => Promise<void>;
};

export type { StealthOpts };

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
	/** Browser engine in use — drives status output and CDP availability. */
	browserName?: BrowserName;
	/** Resolved proxy config for propagation to isolated contexts. */
	proxyConfig?: ProxyConfig;
	/** Resolved config file path — used for plugin path resolution. */
	configPath?: string | null;
	/** Provenance map for flows (inline vs file-based). */
	flowSources?: Map<string, FlowSource>;
	/** Validation errors encountered when loading flow files. */
	flowLoadErrors?: string[];
};

function attachPageListeners(
	page: Page,
	tabState: TabState,
	browser?: BrowserName,
): void {
	page.on("framenavigated", (frame) => {
		if (frame === page.mainFrame()) {
			markStale();
		}
	});

	// CDP console capture is Chromium-only. For Firefox/WebKit, use
	// Playwright's built-in console listener directly.
	if (browser && browser !== "chrome") {
		page.on("console", (msg) => {
			tabState.consoleBuffer.push({
				level: msg.type(),
				text: msg.text(),
				location: msg.location(),
				timestamp: Date.now(),
			});
		});
	} else {
		// Chromium: use CDP — Patchright omits the Runtime.enable call
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
	}

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
	/** Enable persisted session-state restore/save for long-lived daemon runs. */
	persistSessionState?: boolean;
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

	const {
		context,
		config,
		configError,
		stealthOpts,
		token,
		tcpListen,
		browserName,
		proxyConfig,
		configPath,
		flowSources,
		flowLoadErrors,
	} = deps;
	const configCtx = configError ? { configError } : undefined;
	const exitFn = options?.onExit ?? (() => process.exit(0));
	const persistSessionState = options?.persistSessionState === true;
	const startTime = Date.now();
	const logger = createLogger();
	const slowCommandMs = Number.parseInt(
		process.env.BROWSE_SLOW_COMMAND_MS ?? "750",
		10,
	);
	const maxRssMb = Number.parseInt(process.env.BROWSE_MAX_RSS_MB ?? "0", 10);
	const metrics = {
		totalCommands: 0,
		failedCommands: 0,
		recoveries: 0,
		commandsByName: new Map<string, number>(),
		durationByNameMs: new Map<string, number>(),
		lastTraceId: "",
	};
	let activeCommands = 0;
	let persistTimer: ReturnType<typeof setTimeout> | undefined;
	let persistInFlight = false;

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

	// Per-session video state
	const videoStates = new Map<string, ReturnType<typeof createVideoState>>();
	function getVideoState(sessionName: string) {
		let state = videoStates.get(sessionName);
		if (!state) {
			state = createVideoState();
			videoStates.set(sessionName, state);
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
	attachPageListeners(deps.page, initialTabState, browserName);

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
		attachListeners: (p: Page, ts: TabState) =>
			attachPageListeners(p, ts, browserName),
		pluginState: new Map(),
	};
	sessionRegistry.sessions.set("default", defaultSession);

	async function restorePersistedSessionState() {
		const state = loadPersistedDaemonState();
		if (!state) return;
		const defaultSnapshot = state.sessions.find((s) => s.name === "default");
		if (!defaultSnapshot || defaultSnapshot.tabs.length === 0) return;
		for (let i = 1; i < defaultSnapshot.tabs.length; i++) {
			const tabState = await createTab(context);
			defaultSession.tabRegistry.tabs.push(tabState);
		}
		defaultSession.tabRegistry.activeTabIndex = Math.min(
			Math.max(defaultSnapshot.activeTabIndex, 0),
			defaultSession.tabRegistry.tabs.length - 1,
		);
		for (let i = 0; i < defaultSnapshot.tabs.length; i++) {
			const targetUrl = defaultSnapshot.tabs[i]?.url;
			if (!targetUrl || targetUrl === "about:blank") continue;
			try {
				await defaultSession.tabRegistry.tabs[i].page.goto(targetUrl, {
					waitUntil: "domcontentloaded",
				});
			} catch {
				// best effort restore
			}
		}
		logger.info("Restored session state after restart", {
			tabs: defaultSnapshot.tabs.length,
		});
		metrics.recoveries++;
	}

	if (persistSessionState) {
		await restorePersistedSessionState();
	}

	// Load plugins
	const pluginPaths = discoverPluginPaths(config?.plugins, configPath ?? null);
	let pluginRegistry: PluginRegistry;
	if (pluginPaths.length > 0) {
		const { registry, errors } = await loadPlugins(
			pluginPaths,
			config,
			BUILTIN_COMMANDS,
		);
		pluginRegistry = registry;
		for (const err of errors) {
			logger.warn("Plugin warning", { error: err });
		}
	} else {
		pluginRegistry = createEmptyRegistry();
	}
	const pluginCommandNames: ReadonlySet<string> = new Set(
		pluginRegistry.commands.keys(),
	);

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
		attachPageListeners(newPage, tabState, browserName);
		return tabState;
	}

	function buildSessionStateSnapshot() {
		const sessions = Array.from(sessionRegistry.sessions.values()).map(
			(session) => ({
				name: session.name,
				isolated: session.isolated,
				activeTabIndex: session.tabRegistry.activeTabIndex,
				tabs: session.tabRegistry.tabs.map((tab) => ({ url: tab.page.url() })),
			}),
		);
		return {
			version: 1,
			updatedAt: new Date().toISOString(),
			sessions,
		} as const;
	}

	async function flushSessionStatePersist(): Promise<void> {
		if (!persistSessionState) return;
		if (persistInFlight) return;
		persistInFlight = true;
		try {
			await persistDaemonState(buildSessionStateSnapshot());
		} catch (error) {
			logger.warn("Failed to persist session state", {
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			persistInFlight = false;
		}
	}

	function scheduleSessionStatePersist(): void {
		if (!persistSessionState) return;
		if (persistTimer) return;
		persistTimer = setTimeout(() => {
			persistTimer = undefined;
			void flushSessionStatePersist();
		}, 125);
	}

	function runMemoryPressureMitigation(allowRefClear: boolean) {
		if (!Number.isFinite(maxRssMb) || maxRssMb <= 0) return;
		const currentRssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
		if (currentRssMb < maxRssMb) return;
		logger.warn("Memory pressure detected, applying mitigation", {
			currentRssMb,
			limitRssMb: maxRssMb,
		});
		for (const session of sessionRegistry.sessions.values()) {
			for (const tab of session.tabRegistry.tabs) {
				tab.consoleBuffer.clear();
				tab.networkBuffer.clear();
			}
		}
		if (allowRefClear) {
			clearRefs();
		} else {
			logger.debug("Skipping ref clear during active command processing", {
				activeCommands,
			});
		}
		if (typeof global.gc === "function") {
			global.gc();
		}
	}

	function renderPrometheusMetrics(): string {
		const lines = [
			"# HELP browse_daemon_commands_total Total commands handled by daemon",
			"# TYPE browse_daemon_commands_total counter",
			`browse_daemon_commands_total ${metrics.totalCommands}`,
			"# HELP browse_daemon_commands_failed_total Total commands that returned an error",
			"# TYPE browse_daemon_commands_failed_total counter",
			`browse_daemon_commands_failed_total ${metrics.failedCommands}`,
			"# HELP browse_daemon_uptime_seconds Daemon uptime in seconds",
			"# TYPE browse_daemon_uptime_seconds gauge",
			`browse_daemon_uptime_seconds ${Math.floor((Date.now() - startTime) / 1000)}`,
			"# HELP browse_daemon_recoveries_total Session recovery events on startup",
			"# TYPE browse_daemon_recoveries_total counter",
			`browse_daemon_recoveries_total ${metrics.recoveries}`,
			"# HELP browse_daemon_memory_rss_bytes Resident set size in bytes",
			"# TYPE browse_daemon_memory_rss_bytes gauge",
			`browse_daemon_memory_rss_bytes ${process.memoryUsage().rss}`,
			"# HELP browse_daemon_command_total Total commands processed by command name",
			"# TYPE browse_daemon_command_total counter",
			"# HELP browse_daemon_command_duration_ms_sum Total command duration by command name in milliseconds",
			"# TYPE browse_daemon_command_duration_ms_sum summary",
		];
		for (const [cmd, count] of metrics.commandsByName) {
			lines.push(`browse_daemon_command_total{cmd="${cmd}"} ${count}`);
		}
		for (const [cmd, duration] of metrics.durationByNameMs) {
			lines.push(
				`browse_daemon_command_duration_ms_sum{cmd="${cmd}"} ${duration}`,
			);
		}
		return lines.join("\n");
	}

	async function shutdown() {
		idleTimer.clear();
		if (persistTimer) {
			clearTimeout(persistTimer);
			persistTimer = undefined;
			await flushSessionStatePersist();
		}
		server.close();
		tcpServer?.close();
		await runCleanupHooks(pluginRegistry);
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
		"video",
		"init",
		"screenshots",
		"report",
		"completions",
		"replay",
		"flow-share",
		"test-matrix",
		"diff",
		"record",
		"watch",
		"subscribe",
		"monitor",
	]);

	type ConnectionResult = { responseStr: string; quit: boolean };
	function reply(responseStr: string, quit = false): ConnectionResult {
		return { responseStr, quit };
	}

	async function handleConnection(data: string): Promise<ConnectionResult> {
		idleTimer.reset();
		activeCommands++;
		runMemoryPressureMitigation(false);

		try {
			const request = parseRequest(data, pluginCommandNames);
			const traceId = randomUUID();
			metrics.lastTraceId = traceId;
			const startedAt = Date.now();
			const startCpu = process.cpuUsage();
			logger.debug("Command received", {
				traceId,
				cmd: request.cmd,
				session: request.session ?? "default",
			});

			const finalizeMetrics = (response: Response) => {
				const durationMs = Date.now() - startedAt;
				metrics.totalCommands++;
				metrics.commandsByName.set(
					request.cmd,
					(metrics.commandsByName.get(request.cmd) ?? 0) + 1,
				);
				metrics.durationByNameMs.set(
					request.cmd,
					(metrics.durationByNameMs.get(request.cmd) ?? 0) + durationMs,
				);
				if (!response.ok) {
					metrics.failedCommands++;
				}
				if (durationMs >= slowCommandMs) {
					const cpuDelta = process.cpuUsage(startCpu);
					const mem = process.memoryUsage();
					logger.warn("Slow command profiled", {
						traceId,
						cmd: request.cmd,
						durationMs,
						cpuUserMicros: cpuDelta.user,
						cpuSystemMicros: cpuDelta.system,
						rssMb: Math.round(mem.rss / 1024 / 1024),
						heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
					});
				}
				logger.info("Command completed", {
					traceId,
					cmd: request.cmd,
					ok: response.ok,
					durationMs,
				});
			};

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
							...config?.playwright?.contextOptions,
							viewport: { width: 1440, height: 900 },
						};
						if (stealthOpts) {
							contextOpts.userAgent = stealthOpts.userAgent;
						}
						if (proxyConfig) {
							contextOpts.proxy = proxyConfig;
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
				if (request.args.includes("--metrics")) {
					return reply(
						serialiseResponse({
							ok: true,
							data: renderPrometheusMetrics(),
						}),
					);
				}
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
						browserName: browserName ?? "chrome",
						daemonPid: process.pid,
						sessionsDetail: sessionsInfo,
						metrics: {
							totalCommands: metrics.totalCommands,
							failedCommands: metrics.failedCommands,
							recoveries: metrics.recoveries,
							commandsByName: Object.fromEntries(metrics.commandsByName),
							lastTraceId: metrics.lastTraceId,
						},
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
					`Browser: ${browserDisplayName(browserName ?? "chrome")} ${browserVersion}`,
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
			const knownFlags =
				KNOWN_FLAGS[request.cmd] ??
				pluginRegistry.commands.get(request.cmd)?.command.flags;
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
								performWipe: () =>
									handleWipe({
										context: sessionContext,
										tabRegistry,
										clearRefs,
									}),
							},
							configCtx,
							flowSources,
							flowLoadErrors,
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
					case "video":
						return handleVideo(
							sessionContext,
							getVideoState(session.name),
							activeTabState,
							request.args,
							{
								attachListeners: (p) =>
									attachPageListeners(p, activeTabState, browserName),
								stealthOpts: stealthOpts
									? { userAgent: stealthOpts.userAgent }
									: undefined,
								proxyConfig,
								passthroughContextOptions: config?.playwright?.contextOptions,
							},
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
							proxyConfig,
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
					case "perf":
						return handlePerf(page, request.args, {
							json: request.json,
						});
					case "security":
						return handleSecurity(
							page,
							request.args,
							{
								context: sessionContext,
								networkBuffer: getActiveNetworkBuffer(session),
							},
							{ json: request.json },
						);
					case "responsive":
						return handleResponsive(page, request.args, {
							json: request.json,
						});
					case "extract":
						return handleExtract(page, request.args, {
							json: request.json,
						});
					case "crawl":
						return handleCrawl(page, request.args, {
							json: request.json,
						});
					case "record":
						return handleRecord(page, request.args);
					case "throttle":
						return handleThrottle(page, request.args);
					case "offline":
						return handleOffline(page, request.args);
					case "do":
						return handleDo(page, request.args);
					case "vrt":
						return handleVrt(page, request.args, {
							json: request.json,
						});
					case "ci-init":
						return handleCiInit(page, request.args);
					case "watch":
						return handleWatch(page, request.args);
					case "repl":
						return handleRepl(page, request.args);
					case "seo":
						return handleSeo(page, request.args, {
							json: request.json,
						});
					case "subscribe":
						return handleSubscribe(page, request.args);
					case "dev":
						return handleDev(page, request.args, {
							config,
						});
					case "compliance":
						return handleCompliance(
							page,
							request.args,
							{
								context: sessionContext,
								networkBuffer: getActiveNetworkBuffer(session),
							},
							{ json: request.json },
						);
					case "security-scan":
						return handleSecurityScan(page, request.args, {
							json: request.json,
						});
					case "i18n":
						return handleI18n(page, request.args, {
							json: request.json,
						});
					case "api-assert":
						return handleApiAssertCmd(page, request.args, {
							json: request.json,
						});
					case "design-audit":
						return handleDesignAudit(page, request.args, {
							json: request.json,
						});
					case "doc-capture":
						return handleDocCapture(page, request.args, {
							json: request.json,
						});
					case "gesture":
						return handleGesture(page, request.args);
					case "devices":
						return handleDevices(page, request.args);
					case "monitor":
						return handleMonitor(page, request.args);
					case "quit":
						return handleQuit();
					default: {
						// Dispatch to plugin commands
						const pluginCmd = pluginRegistry.commands.get(request.cmd);
						if (pluginCmd) {
							const ctx: CommandContext = {
								page,
								context: sessionContext,
								config,
								args: request.args,
								sessionState: getPluginSessionState(
									session.pluginState,
									pluginCmd.plugin,
								),
								request: {
									session: request.session,
									json: request.json,
									timeout: request.timeout,
								},
							};
							try {
								return await pluginCmd.command.handler(ctx);
							} catch (err) {
								const message =
									err instanceof Error ? err.message : String(err);
								return {
									ok: false,
									error: `Plugin '${pluginCmd.plugin}' error: ${message}`,
								};
							}
						}
						return {
							ok: false,
							error: `Command '${request.cmd}' is not yet implemented.`,
						};
					}
				}
			}

			// Build plugin context for hooks (only if hooks are registered)
			const hasHooks =
				pluginRegistry.hooks.beforeCommand.length > 0 ||
				pluginRegistry.hooks.afterCommand.length > 0;
			let pluginCtx: CommandContext | undefined;
			if (hasHooks) {
				const pluginCmd = pluginRegistry.commands.get(request.cmd);
				pluginCtx = {
					page,
					context: sessionContext,
					config,
					args: request.args,
					sessionState: pluginCmd
						? getPluginSessionState(session.pluginState, pluginCmd.plugin)
						: {},
					request: {
						session: request.session,
						json: request.json,
						timeout: request.timeout,
					},
				};
			}

			// Run beforeCommand hooks
			if (pluginCtx) {
				const hookResponse = await runBeforeHooks(
					pluginRegistry,
					request.cmd,
					pluginCtx,
				);
				if (hookResponse) {
					finalizeMetrics(hookResponse);
					return reply(serialiseResponse(hookResponse));
				}
			}

			const isExempt =
				TIMEOUT_EXEMPT.has(request.cmd) ||
				pluginRegistry.commands.get(request.cmd)?.command.timeoutExempt ===
					true;

			let response: Response;
			if (isExempt) {
				response = await executeCommand();
			} else {
				const timeoutMs = resolveTimeout(request.timeout, config?.timeout);
				response = await withTimeout(executeCommand, timeoutMs);
			}

			// Run afterCommand hooks
			if (pluginCtx) {
				await runAfterHooks(pluginRegistry, request.cmd, pluginCtx, response);
			}

			finalizeMetrics(response);
			if (
				request.cmd !== "status" &&
				request.cmd !== "ping" &&
				request.cmd !== "quit"
			) {
				scheduleSessionStatePersist();
			}
			return reply(serialiseResponse(response), request.cmd === "quit");
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return reply(serialiseResponse({ ok: false, error: message }));
		} finally {
			activeCommands = Math.max(0, activeCommands - 1);
			if (activeCommands === 0) {
				runMemoryPressureMitigation(true);
			}
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

/** Resolve the Playwright BrowserType for the given browser name. */
function resolveBrowserType(name: BrowserName): BrowserType {
	switch (name) {
		case "firefox":
			return firefox;
		case "webkit":
			return webkit;
		default:
			return chromium;
	}
}

/** Pretty-print the browser name for status output. */
export function browserDisplayName(name: BrowserName): string {
	switch (name) {
		case "firefox":
			return "Firefox";
		case "webkit":
			return "WebKit";
		default:
			return "Chromium";
	}
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

	// Load config early so we can read the browser preference from it
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

	// Load flow files from flows/ directories and merge with inline flows
	let flowSources: Map<string, FlowSource> | undefined;
	let flowLoadErrors: string[] | undefined;
	if (config) {
		const flowDirs = discoverFlowDirectories(resolvedConfigPath);
		if (flowDirs.length > 0) {
			const {
				flows: fileFlows,
				errors: flowErrors,
				sources: fileSources,
			} = loadFlowsFromDirectories(flowDirs);
			const { merged, sources } = mergeFlows(
				config.flows,
				fileFlows,
				fileSources,
			);
			config = { ...config, flows: merged };
			flowSources = sources;
			flowLoadErrors = flowErrors.length > 0 ? flowErrors : undefined;
			for (const err of flowErrors) {
				console.error(`Flow warning: ${err}`);
			}
		}
	}

	// Browser precedence: CLI flag / env var > config file > default ("chrome")
	const browserName: BrowserName =
		options.browser ?? config?.browser ?? "chrome";
	const isChromium = browserName === "chrome";

	// Proxy precedence: CLI flag / env var > config file > none
	const proxyConfig: ProxyConfig | undefined = options.proxy
		? { server: options.proxy }
		: config?.proxy;

	const userDataDir =
		options.userDataDir ?? join(homedir(), ".bun-browse", "user-data");

	const launcher = resolveBrowserType(browserName);

	const launchOptions: Record<string, unknown> = {
		// Spread user-provided Playwright passthrough options first (ours win on conflict)
		...config?.playwright?.launchOptions,
		headless: options.headless ?? true,
		viewport: { width: 1440, height: 900 },
	};

	if (proxyConfig) {
		launchOptions.proxy = proxyConfig;
	}

	// Detect Chrome version pre-launch to set the UA at the browser level.
	// Setting userAgent at launch ensures all contexts (main, dedicated workers,
	// shared workers, service workers) see the clean UA without HeadlessChrome.
	let stealthOpts: StealthOpts | undefined;
	if (isChromium) {
		stealthOpts = await buildStealthUA("chrome");
		launchOptions.channel = "chrome";
		launchOptions.args = stealthArgs(stealthOpts.userAgent);
		launchOptions.ignoreDefaultArgs = [
			"--enable-automation",
			"--disable-popup-blocking",
			"--disable-component-update",
			"--disable-default-apps",
		];
		launchOptions.userAgent = stealthOpts.userAgent;
	}

	const context: BrowserContext = await launcher.launchPersistentContext(
		userDataDir,
		launchOptions,
	);

	// Apply stealth scripts (patches navigator properties in the JS context).
	if (isChromium && stealthOpts) {
		const opts = stealthOpts;
		await applyStealthScripts(context, opts);

		// Also use CDP Emulation.setUserAgentOverride per page.
		// The launch-level userAgent only sets HTTP headers; CDP override
		// patches navigator.userAgent in JS for dedicated workers.
		// ServiceWorkers are covered by the --user-agent= Chromium flag
		// passed via stealthArgs().
		//
		// Passing userAgentMetadata ensures navigator.userAgentData returns
		// correct brands/platform/versions natively (via C++ slots) without
		// needing JS-level prototype patching, which detection scripts like
		// CreepJS can identify as tampered.
		const uaDataPlatform =
			opts.navigatorPlatform === "MacIntel"
				? "macOS"
				: opts.navigatorPlatform === "Win32"
					? "Windows"
					: "Linux";
		const brandEntry = {
			brand: "Chromium",
			version: opts.chromeMajor,
		};
		const chromeEntry = {
			brand: "Google Chrome",
			version: opts.chromeMajor,
		};
		const notABrand = { brand: "Not-A.Brand", version: "8" };
		const fullBrandEntry = {
			brand: "Chromium",
			version: opts.chromeFullVersion,
		};
		const fullChromeEntry = {
			brand: "Google Chrome",
			version: opts.chromeFullVersion,
		};
		const fullNotABrand = {
			brand: "Not-A.Brand",
			version: "8.0.0.0",
		};

		const applyUAOverride = async (p: Page) => {
			try {
				const cdp = await context.newCDPSession(p);
				// Set default background colour to opaque white to avoid
				// headless detection via hasKnownBgColor (headless uses
				// transparent rgba(0,0,0,0) by default).
				await cdp.send("Emulation.setDefaultBackgroundColorOverride", {
					color: { r: 255, g: 255, b: 255, a: 1 },
				});
				// Set prefers-color-scheme to dark to avoid prefersLightColor detection
				// (headless defaults to light, real browsers are often set to dark)
				await cdp.send("Emulation.setEmulatedMedia", {
					features: [{ name: "prefers-color-scheme", value: "dark" }],
				});
				await cdp.send("Emulation.setUserAgentOverride", {
					userAgent: opts.userAgent,
					platform: opts.navigatorPlatform,
					userAgentMetadata: {
						brands: [brandEntry, chromeEntry, notABrand],
						fullVersionList: [fullBrandEntry, fullChromeEntry, fullNotABrand],
						platform: uaDataPlatform,
						platformVersion: opts.platformVersion,
						architecture: opts.architecture,
						model: "",
						mobile: false,
						bitness: opts.bitness,
						wow64: false,
					},
				});
			} catch {
				// CDP session may fail for special pages (about:blank, etc.)
			}
		};
		for (const p of context.pages()) {
			await applyUAOverride(p);
		}
		context.on("page", applyUAOverride);
	}

	const page: Page = context.pages()[0] ?? (await context.newPage());
	const daemonLogger = createLogger();

	// Browser crash detection — clean exit so CLI cold-starts a fresh daemon
	context.browser()?.on("disconnected", () => {
		daemonLogger.error("Browser disconnected — daemon exiting.");
		cleanupFiles(lifecycleConfig);
		cleanupToken();
		process.exit(1);
	});

	writePidFile(lifecycleConfig);

	// Generate auth token for socket security
	const token = generateToken();

	const { shutdown } = await startServer(
		{
			page,
			context,
			config,
			configError,
			stealthOpts,
			token,
			tcpListen: options.tcpListen,
			browserName,
			proxyConfig,
			configPath: resolvedConfigPath,
			flowSources,
			flowLoadErrors,
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
		{ persistSessionState: true },
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
