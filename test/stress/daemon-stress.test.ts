import { describe, expect, test } from "bun:test";
import { sendWithRetry } from "../../src/retry.ts";

describe("stress: daemon command loop", () => {
	test("repeated ping/status does not fail", async () => {
		const parsedIterations = Number.parseInt(
			process.env.BROWSE_STRESS_ITERATIONS ?? "50",
			10,
		);
		const iterations =
			Number.isFinite(parsedIterations) && parsedIterations > 0
				? parsedIterations
				: 50;
		let failures = 0;
		for (let i = 0; i < iterations; i++) {
			for (const cmd of ["ping", "status"] as const) {
				const result = await sendWithRetry(
					{
						sendRequest: async (command, _args) => {
							if (command === "status") {
								return { ok: true, data: "Daemon PID: 123" };
							}
							return { ok: true, data: "pong" };
						},
						cleanupStaleFiles: () => {},
						spawnDaemon: async () => {},
						sleep: async () => {},
					},
					cmd,
					[],
				);
				if (!result.ok) failures++;
			}
		}
		expect(failures).toBe(0);
	});
});
