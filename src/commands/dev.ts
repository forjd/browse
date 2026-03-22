import type { Page } from "playwright";
import type { BrowseConfig } from "../config.ts";
import type { Response } from "../protocol.ts";

export type DevServerConfig = {
	command: string;
	url: string;
	timeout?: number;
	reuseExisting?: boolean;
	env?: Record<string, string>;
	cwd?: string;
};

async function checkUrl(url: string): Promise<boolean> {
	try {
		const resp = await fetch(url, { signal: AbortSignal.timeout(3_000) });
		return resp.status >= 200 && resp.status < 400;
	} catch {
		return false;
	}
}

export async function handleDev(
	_page: Page,
	args: string[],
	options?: { config?: BrowseConfig | null },
): Promise<Response> {
	if (args.length === 0) {
		return {
			ok: false,
			error: `Usage: browse dev <start|stop|status> [--flow <name>]

Manages a dev server lifecycle.

Configure in browse.config.json:
  {
    "devServer": {
      "command": "npm run dev",
      "url": "http://localhost:3000",
      "timeout": 30000,
      "reuseExisting": true
    }
  }

Subcommands:
  start          Start the dev server
  stop           Stop the dev server
  status         Check if dev server is running`,
		};
	}

	const sub = args[0];

	// Check for devServer config
	const config = options?.config;
	const devServer = (config as Record<string, unknown> | null)?.devServer as
		| DevServerConfig
		| undefined;

	switch (sub) {
		case "status": {
			if (!devServer) {
				return {
					ok: true,
					data: "Dev server: not configured (add devServer to browse.config.json)",
				};
			}
			const running = await checkUrl(devServer.url);
			return {
				ok: true,
				data: running
					? `Dev server: running at ${devServer.url}`
					: `Dev server: not running (${devServer.url})`,
			};
		}

		case "start": {
			if (!devServer) {
				return {
					ok: false,
					error:
						"No devServer configured. Add a devServer section to browse.config.json.",
				};
			}

			// Check if already running
			if (devServer.reuseExisting !== false) {
				const running = await checkUrl(devServer.url);
				if (running) {
					return {
						ok: true,
						data: `Dev server already running at ${devServer.url} (reusing existing)`,
					};
				}
			}

			// Spawn the dev server
			try {
				const env = { ...process.env, ...(devServer.env ?? {}) };
				const proc = Bun.spawn(devServer.command.split(" "), {
					cwd: devServer.cwd ?? process.cwd(),
					env,
					stdout: "ignore",
					stderr: "ignore",
				});

				// Poll for readiness
				const timeout = devServer.timeout ?? 30_000;
				const start = Date.now();
				let ready = false;

				while (Date.now() - start < timeout) {
					ready = await checkUrl(devServer.url);
					if (ready) break;
					await new Promise((r) => setTimeout(r, 500));
				}

				if (!ready) {
					proc.kill();
					return {
						ok: false,
						error: `Dev server failed to start within ${timeout}ms. Command: ${devServer.command}`,
					};
				}

				const elapsed = ((Date.now() - start) / 1000).toFixed(1);
				return {
					ok: true,
					data: `Dev server ready at ${devServer.url} (${elapsed}s)`,
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					ok: false,
					error: `Failed to start dev server: ${message}`,
				};
			}
		}

		case "stop": {
			return {
				ok: true,
				data: "Dev server stop: use Ctrl+C or kill the process manually.\nBrowse does not track the dev server PID across daemon restarts.",
			};
		}

		default:
			return {
				ok: false,
				error: `Unknown dev subcommand: "${sub}". Use: start, stop, status`,
			};
	}
}
