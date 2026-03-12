import { connect } from "node:net";
import { startDaemon } from "./daemon.ts";
import { DEFAULT_CONFIG } from "./lifecycle.ts";
import type { Response } from "./protocol.ts";

const USAGE = `Usage: browse <command> [args...]

Commands:
  goto <url>    Navigate to URL, return page title
  text          Return visible text content
  quit          Shut down the daemon`;

export type ParsedArgs =
	| { cmd: string; args: string[] }
	| { daemon: true }
	| null;

export function parseArgs(argv: string[]): ParsedArgs {
	if (argv.length === 0) return null;
	if (argv[0] === "--daemon") return { daemon: true };
	const [cmd, ...args] = argv;
	return { cmd: cmd as string, args };
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
): Promise<Response> {
	return new Promise((resolve, reject) => {
		const client = connect(socketPath, () => {
			client.write(`${JSON.stringify({ cmd, args })}\n`);
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
		process.stderr.write(`${USAGE}\n`);
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

	const { cmd, args } = parsed;

	let response: Response;
	try {
		response = await sendRequest(DEFAULT_CONFIG.socketPath, cmd, args);
	} catch (err) {
		if (err instanceof Error && err.message === "DAEMON_NOT_RUNNING") {
			try {
				await spawnDaemon();
			} catch {
				process.stderr.write("Error: Failed to start daemon.\n");
				process.exit(1);
			}
			try {
				response = await sendRequest(DEFAULT_CONFIG.socketPath, cmd, args);
			} catch {
				process.stderr.write("Error: Daemon connection lost.\n");
				process.exit(1);
			}
		} else {
			process.stderr.write(
				`Error: ${err instanceof Error ? err.message : String(err)}\n`,
			);
			process.exit(1);
		}
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
