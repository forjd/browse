import { connect } from "node:net";
import { startDaemon } from "./daemon.ts";
import { formatCommandHelp, formatOverview } from "./help.ts";
import { cleanupFiles, DEFAULT_CONFIG } from "./lifecycle.ts";
import type { Response } from "./protocol.ts";
import { sendWithRetry } from "./retry.ts";
import { formatVersion } from "./version.ts";

export type ParsedArgs =
	| {
			cmd: string;
			args: string[];
			timeout?: number;
			session?: string;
			json?: boolean;
	  }
	| { daemon: true }
	| null;

/**
 * Parse CLI arguments, extracting global flags (--timeout, --session, --json) from args.
 */
export function parseArgs(argv: string[]): ParsedArgs {
	if (argv.length === 0) return null;
	if (argv[0] === "--daemon") return { daemon: true };

	const [cmd, ...rawArgs] = argv;

	// Extract global flags
	let timeout: number | undefined;
	let session: string | undefined;
	let json = false;
	const args: string[] = [];

	for (let i = 0; i < rawArgs.length; i++) {
		if (rawArgs[i] === "--timeout" && i + 1 < rawArgs.length) {
			const val = Number.parseInt(rawArgs[i + 1], 10);
			if (!Number.isNaN(val) && val > 0) {
				timeout = val;
			}
			i++; // skip the value
		} else if (rawArgs[i] === "--session" && i + 1 < rawArgs.length) {
			session = rawArgs[i + 1];
			i++; // skip the value
		} else if (rawArgs[i] === "--json") {
			json = true;
		} else {
			args.push(rawArgs[i]);
		}
	}

	return { cmd: cmd as string, args, timeout, session, json };
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
): Promise<Response> {
	return new Promise((resolve, reject) => {
		const payload: Record<string, unknown> = { cmd, args };
		if (timeout) payload.timeout = timeout;
		if (session) payload.session = session;
		if (json) payload.json = json;

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

async function spawnDaemon(): Promise<void> {
	const proc = Bun.spawn([process.execPath, "--daemon"], {
		stdio: ["ignore", "ignore", "ignore"],
	});
	proc.unref();

	await waitForSocket(DEFAULT_CONFIG.socketPath);
}

async function runCli(): Promise<void> {
	const rawArgs = process.argv.slice(2);
	const parsed = parseArgs(rawArgs);

	if (parsed === null) {
		process.stderr.write(`${formatOverview()}\n`);
		process.exit(1);
	}

	if ("daemon" in parsed) {
		await startDaemon({
			socketPath: DEFAULT_CONFIG.socketPath,
			pidPath: DEFAULT_CONFIG.pidPath,
			idleTimeoutMs: DEFAULT_CONFIG.idleTimeoutMs,
			headless: true,
		});
		return;
	}

	const { cmd, args, timeout, session, json } = parsed;

	// Handle version command (client-side, no daemon)
	if (cmd === "version" || cmd === "--version") {
		process.stdout.write(`${formatVersion()}\n`);
		return;
	}

	// Handle help command and --help / -h flags (client-side, no daemon)
	if (cmd === "help" || cmd === "--help" || cmd === "-h") {
		const target = args[0];
		if (target) {
			const detail = formatCommandHelp(target);
			if (detail) {
				process.stdout.write(`${detail}\n`);
			} else {
				process.stderr.write(
					`Unknown command: ${target}\n\n${formatOverview()}\n`,
				);
				process.exit(1);
			}
		} else {
			process.stdout.write(`${formatOverview()}\n`);
		}
		return;
	}

	// Handle `browse <command> --help`
	if (args.includes("--help")) {
		const detail = formatCommandHelp(cmd);
		if (detail) {
			process.stdout.write(`${detail}\n`);
		} else {
			process.stderr.write(`Unknown command: ${cmd}\n\n${formatOverview()}\n`);
			process.exit(1);
		}
		return;
	}

	let response: Response;
	try {
		response = await sendWithRetry(
			{
				sendRequest: (c, a) =>
					sendRequest(DEFAULT_CONFIG.socketPath, c, a, timeout, session, json),
				spawnDaemon,
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

// Only run when executed directly, not when imported by tests
if (import.meta.main) {
	const rawArgs = process.argv.slice(2);
	const parsed = parseArgs(rawArgs);

	if (parsed !== null && "daemon" in parsed) {
		await startDaemon({
			socketPath: DEFAULT_CONFIG.socketPath,
			pidPath: DEFAULT_CONFIG.pidPath,
			idleTimeoutMs: DEFAULT_CONFIG.idleTimeoutMs,
			headless: true,
		});
	} else {
		await runCli();
	}
}
