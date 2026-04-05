import { connect } from "node:net";
import { readToken } from "./auth.ts";
import type { BrowserName } from "./config.ts";
import {
	loadConfig,
	resolveConfigPath,
	VALID_BROWSER_NAMES,
} from "./config.ts";
import { startDaemon } from "./daemon.ts";
import {
	formatCommandHelp,
	formatOverview,
	type PluginHelpEntry,
} from "./help.ts";
import { cleanupFiles, DEFAULT_CONFIG } from "./lifecycle.ts";
import { discoverPluginPaths, validatePlugin } from "./plugin-loader.ts";
import type { Response } from "./protocol.ts";
import { sendWithRetry } from "./retry.ts";
import { formatVersion } from "./version.ts";

/**
 * Load plugin help entries by discovering and importing plugins.
 * Best-effort — errors are silently ignored since this is just for help text.
 */
async function loadPluginHelp(
	configPath?: string,
): Promise<Record<string, PluginHelpEntry>> {
	const entries: Record<string, PluginHelpEntry> = {};
	try {
		const resolvedPath = resolveConfigPath(configPath);
		let plugins: string[] | undefined;
		if (resolvedPath) {
			const { config } = loadConfig(resolvedPath);
			plugins = config?.plugins;
		}
		const paths = discoverPluginPaths(plugins, resolvedPath);
		for (const path of paths) {
			try {
				const mod = await import(path);
				const raw = mod.default ?? mod;
				const result = validatePlugin(raw, path);
				if (typeof result === "string") continue;
				for (const cmd of result.commands ?? []) {
					entries[cmd.name] = { summary: cmd.summary, usage: cmd.usage };
				}
			} catch {
				// Skip unloadable plugins in help
			}
		}
	} catch {
		// Config not found or invalid — no plugin help
	}
	return entries;
}

function isHeadedMode(): boolean {
	return (
		process.env.BROWSE_HEADED === "1" || process.env.BROWSE_HEADED === "true"
	);
}

/**
 * Resolve the browser name from CLI flag, then BROWSE_BROWSER env var.
 * Returns undefined if neither is set (daemon will default to "chrome").
 */
/**
 * Resolve the proxy server URL from CLI flag, then BROWSE_PROXY env var.
 * Returns undefined if neither is set.
 */
function resolveProxy(flag?: string): string | undefined {
	if (flag) return flag;
	return process.env.BROWSE_PROXY || undefined;
}

function resolveBrowserFromFlag(flag?: string): BrowserName | undefined {
	if (flag && VALID_BROWSER_NAMES.has(flag.toLowerCase())) {
		return flag.toLowerCase() as BrowserName;
	}
	const envVal = process.env.BROWSE_BROWSER?.toLowerCase();
	if (envVal && VALID_BROWSER_NAMES.has(envVal)) {
		return envVal as BrowserName;
	}
	return undefined;
}

export type ParsedArgs =
	| {
			cmd: string;
			args: string[];
			timeout?: number;
			session?: string;
			json?: boolean;
			config?: string;
	  }
	| {
			daemon: true;
			config?: string;
			listen?: string;
			browser?: string;
			proxy?: string;
	  };

/**
 * Parse CLI arguments, extracting global flags (--timeout, --session, --json) from args.
 */
export function parseArgs(argv: string[]): ParsedArgs {
	if (argv.length === 0)
		return {
			cmd: "help",
			args: [],
			timeout: undefined,
			session: undefined,
			json: false,
		};

	// Extract --config from anywhere in argv (it's a global flag)
	let config: string | undefined;
	const filteredArgv: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--config" && i + 1 < argv.length) {
			config = argv[i + 1];
			i++;
		} else {
			filteredArgv.push(argv[i]);
		}
	}

	if (filteredArgv.length === 0)
		return {
			cmd: "help",
			args: [],
			timeout: undefined,
			session: undefined,
			json: false,
			config,
		};

	// Extract --listen for daemon mode
	let listen: string | undefined;
	const filteredArgv2: string[] = [];
	for (let i = 0; i < filteredArgv.length; i++) {
		if (filteredArgv[i] === "--listen" && i + 1 < filteredArgv.length) {
			listen = filteredArgv[i + 1];
			i++;
		} else {
			filteredArgv2.push(filteredArgv[i]);
		}
	}

	// Extract --browser for daemon mode
	let browser: string | undefined;
	const filteredArgv3: string[] = [];
	for (let i = 0; i < filteredArgv2.length; i++) {
		if (filteredArgv2[i] === "--browser" && i + 1 < filteredArgv2.length) {
			browser = filteredArgv2[i + 1];
			i++;
		} else {
			filteredArgv3.push(filteredArgv2[i]);
		}
	}

	// Extract --proxy for daemon mode
	let proxy: string | undefined;
	const filteredArgv4: string[] = [];
	for (let i = 0; i < filteredArgv3.length; i++) {
		if (filteredArgv3[i] === "--proxy" && i + 1 < filteredArgv3.length) {
			proxy = filteredArgv3[i + 1];
			i++;
		} else {
			filteredArgv4.push(filteredArgv3[i]);
		}
	}

	if (filteredArgv4[0] === "--daemon")
		return { daemon: true, config, listen, browser, proxy };

	// Extract global flags (--timeout, --session, --json) from anywhere in argv
	let timeout: number | undefined;
	let session: string | undefined;
	let json = false;
	const remaining: string[] = [];

	for (let i = 0; i < filteredArgv4.length; i++) {
		if (filteredArgv4[i] === "--timeout" && i + 1 < filteredArgv4.length) {
			const val = Number.parseInt(filteredArgv4[i + 1], 10);
			if (!Number.isNaN(val) && val > 0) {
				timeout = val;
			}
			i++; // skip the value
		} else if (filteredArgv4[i] === "--session") {
			if (i + 1 < filteredArgv4.length) {
				session = filteredArgv4[i + 1];
				i++; // skip the value
			}
			// Missing value: --session flag is silently ignored (same as --timeout)
		} else if (filteredArgv4[i] === "--json") {
			json = true;
		} else {
			remaining.push(filteredArgv4[i]);
		}
	}

	if (remaining.length === 0)
		return { cmd: "help", args: [], timeout, session, json, config };

	const [cmd, ...args] = remaining;

	return { cmd: cmd as string, args, timeout, session, json, config };
}

/**
 * Extract status-specific CLI flags (--watch, --interval, --exit-code) from args.
 * These are handled client-side and not sent to the daemon.
 */
export function extractStatusFlags(args: string[]): {
	watch: boolean;
	interval: number;
	exitCode: boolean;
	cleanArgs: string[];
} {
	let watch = false;
	let interval = 5;
	let exitCode = false;
	const cleanArgs: string[] = [];

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--watch") {
			watch = true;
		} else if (args[i] === "--interval") {
			if (i + 1 < args.length) {
				const val = Number.parseInt(args[i + 1], 10);
				if (!Number.isNaN(val) && val > 0) {
					interval = val;
				}
				i++; // skip the value
			}
		} else if (args[i] === "--exit-code") {
			exitCode = true;
		} else {
			cleanArgs.push(args[i]);
		}
	}

	return { watch, interval, exitCode, cleanArgs };
}

export function formatOutput(response: Response): {
	output: string;
	isError: boolean;
} {
	if (response.ok) {
		return { output: response.data, isError: false };
	}
	return { output: `Error: ${response.error}`, isError: true };
}

function sendRequest(
	socketPath: string,
	cmd: string,
	args: string[],
	timeout?: number,
	session?: string,
	json?: boolean,
	token?: string | null,
): Promise<Response> {
	return new Promise((resolve, reject) => {
		const payload: Record<string, unknown> = { cmd, args };
		if (timeout) payload.timeout = timeout;
		if (session) payload.session = session;
		if (json) payload.json = json;
		if (token) payload.token = token;

		const client = connect(socketPath, () => {
			client.write(`${JSON.stringify(payload)}\n`);
		});

		let data = "";
		client.on("data", (chunk) => {
			data += chunk.toString();
		});
		client.on("end", () => {
			try {
				resolve(JSON.parse(data.trim()));
			} catch {
				reject(new Error("Failed to parse daemon response"));
			}
		});
		client.on("error", (err) => {
			if (
				(err as NodeJS.ErrnoException).code === "ECONNREFUSED" ||
				(err as NodeJS.ErrnoException).code === "ENOENT"
			) {
				reject(new Error("DAEMON_NOT_RUNNING"));
			} else {
				reject(new Error("Daemon connection lost."));
			}
		});
	});
}

async function waitForSocket(
	socketPath: string,
	timeoutMs = 10_000,
): Promise<void> {
	const start = Date.now();
	const interval = 100;

	while (Date.now() - start < timeoutMs) {
		try {
			await new Promise<void>((resolve, reject) => {
				const client = connect(socketPath, () => {
					client.end();
					resolve();
				});
				client.on("error", reject);
			});
			return;
		} catch {
			await Bun.sleep(interval);
		}
	}

	throw new Error("Timed out waiting for daemon to start.");
}

async function spawnDaemon(
	configPath?: string,
	browserName?: BrowserName,
	proxyServer?: string,
): Promise<void> {
	const args = [process.execPath, "--daemon"];
	if (configPath) {
		args.push("--config", configPath);
	}
	if (browserName) {
		args.push("--browser", browserName);
	}
	if (proxyServer) {
		args.push("--proxy", proxyServer);
	}
	const proc = Bun.spawn(args, {
		stdio: ["ignore", "ignore", "ignore"],
	});
	proc.unref();

	await waitForSocket(DEFAULT_CONFIG.socketPath);
}

async function runCli(): Promise<void> {
	const rawArgs = process.argv.slice(2);
	const parsed = parseArgs(rawArgs);

	if ("daemon" in parsed) {
		const browserName = resolveBrowserFromFlag(parsed.browser);
		const proxyServer = resolveProxy(parsed.proxy);
		await startDaemon({
			socketPath: DEFAULT_CONFIG.socketPath,
			pidPath: DEFAULT_CONFIG.pidPath,
			idleTimeoutMs: DEFAULT_CONFIG.idleTimeoutMs,
			headless: !isHeadedMode(),
			configPath: parsed.config,
			tcpListen: parsed.listen,
			browser: browserName,
			proxy: proxyServer,
		});
		return;
	}

	const { cmd, args, timeout, session, json, config: configPath } = parsed;

	// Handle version command (client-side, no daemon)
	if (cmd === "version" || cmd === "--version") {
		process.stdout.write(`${formatVersion()}\n`);
		return;
	}

	// Handle help command and --help / -h flags (client-side, no daemon)
	if (cmd === "help" || cmd === "--help" || cmd === "-h") {
		const pluginHelp = await loadPluginHelp(configPath);
		const target = args[0];
		if (target) {
			const detail = formatCommandHelp(target, pluginHelp);
			if (detail) {
				process.stdout.write(`${detail}\n`);
			} else {
				process.stderr.write(
					`Unknown command: ${target}\n\n${formatOverview(pluginHelp)}\n`,
				);
				process.exit(1);
			}
		} else {
			process.stdout.write(`${formatOverview(pluginHelp)}\n`);
		}
		return;
	}

	// Handle `browse <command> --help`
	if (args.includes("--help")) {
		const pluginHelp = await loadPluginHelp(configPath);
		const detail = formatCommandHelp(cmd, pluginHelp);
		if (detail) {
			process.stdout.write(`${detail}\n`);
		} else {
			process.stderr.write(
				`Unknown command: ${cmd}\n\n${formatOverview(pluginHelp)}\n`,
			);
			process.exit(1);
		}
		return;
	}

	// Status command: handle --watch, --interval, --exit-code client-side
	if (cmd === "status") {
		const statusFlags = extractStatusFlags(args);
		const retryDeps = {
			sendRequest: (c: string, a: string[]) =>
				sendRequest(
					DEFAULT_CONFIG.socketPath,
					c,
					a,
					timeout,
					session,
					json,
					readToken(),
				),
			spawnDaemon: () =>
				spawnDaemon(configPath, resolveBrowserFromFlag(), resolveProxy()),
			cleanupStaleFiles: () => cleanupFiles(DEFAULT_CONFIG),
		};

		if (statusFlags.exitCode) {
			try {
				await sendWithRetry(retryDeps, cmd, statusFlags.cleanArgs);
				process.exit(0);
			} catch {
				process.exit(1);
			}
		}

		if (statusFlags.watch) {
			const intervalMs = statusFlags.interval * 1000;

			// eslint-disable-next-line no-constant-condition
			while (true) {
				try {
					const response = await sendWithRetry(
						retryDeps,
						cmd,
						statusFlags.cleanArgs,
					);
					const { output, isError } = formatOutput(response);
					if (json) {
						// NDJSON: one JSON object per line
						process.stdout.write(`${output}\n`);
					} else {
						// Clear screen and rewrite for human-readable output
						process.stdout.write(`\x1b[2J\x1b[H${output}\n`);
					}
					if (isError) {
						process.exitCode = 1;
					}
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					if (json) {
						process.stdout.write(`${JSON.stringify({ error: msg })}\n`);
					} else {
						process.stdout.write(`\x1b[2J\x1b[HError: ${msg}\n`);
					}
					process.exitCode = 1;
				}
				await Bun.sleep(intervalMs);
			}
		}
	}

	let response: Response;
	try {
		response = await sendWithRetry(
			{
				sendRequest: (c, a) =>
					sendRequest(
						DEFAULT_CONFIG.socketPath,
						c,
						a,
						timeout,
						session,
						json,
						readToken(),
					),
				spawnDaemon: () =>
					spawnDaemon(configPath, resolveBrowserFromFlag(), resolveProxy()),
				cleanupStaleFiles: () => cleanupFiles(DEFAULT_CONFIG),
			},
			cmd,
			args,
		);
	} catch (err) {
		process.stderr.write(
			`Error: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(1);
	}

	const { output, isError } = formatOutput(response);

	if (isError) {
		process.stderr.write(`${output}\n`);
		process.exit(1);
	} else {
		process.stdout.write(`${output}\n`);
	}
}

// Only run when executed directly, not when imported by tests.
// The daemon path is duplicated here (vs inside runCli) to avoid the
// dynamic import of daemon.ts on every CLI invocation — the compiled
// binary short-circuits into the daemon without loading CLI-only modules.
if (import.meta.main) {
	const rawArgs = process.argv.slice(2);
	const parsed = parseArgs(rawArgs);

	if (parsed !== null && "daemon" in parsed) {
		const browserName = resolveBrowserFromFlag(parsed.browser);
		const proxyServer = resolveProxy(parsed.proxy);
		await startDaemon({
			socketPath: DEFAULT_CONFIG.socketPath,
			pidPath: DEFAULT_CONFIG.pidPath,
			idleTimeoutMs: DEFAULT_CONFIG.idleTimeoutMs,
			headless: !isHeadedMode(),
			configPath: parsed.config,
			tcpListen: parsed.listen,
			browser: browserName,
			proxy: proxyServer,
		});
	} else {
		await runCli();
	}
}
