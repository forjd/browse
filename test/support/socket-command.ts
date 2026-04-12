import { connect } from "node:net";

export function sendSocketRequest<T = unknown>(
	socketPath: string,
	payload: Record<string, unknown>,
	timeoutMs = 5_000,
): Promise<T> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const settle = (fn: () => void) => {
			if (!settled) {
				settled = true;
				fn();
			}
		};

		const client = connect(socketPath, () => {
			client.write(`${JSON.stringify(payload)}\n`);
		});

		const timer = setTimeout(() => {
			settle(() => {
				client.destroy();
				reject(
					new Error(
						`Timed out waiting for socket response after ${timeoutMs}ms`,
					),
				);
			});
		}, timeoutMs);

		let buffer = "";
		client.on("data", (chunk) => {
			buffer += chunk.toString();
			const newlineIndex = buffer.indexOf("\n");
			if (newlineIndex === -1) return;
			const line = buffer.slice(0, newlineIndex).trim();
			client.end();
			clearTimeout(timer);
			settle(() => {
				try {
					resolve(JSON.parse(line) as T);
				} catch {
					reject(new Error(`Failed to parse response: ${buffer}`));
				}
			});
		});

		client.on("end", () => {
			clearTimeout(timer);
			if (!settled) {
				settle(() => reject(new Error(`Failed to parse response: ${buffer}`)));
			}
		});

		client.on("error", (err) => {
			clearTimeout(timer);
			settle(() => reject(err));
		});
	});
}
