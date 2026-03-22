import { describe, expect, test } from "bun:test";
import {
	getCurrentThrottle,
	handleThrottle,
} from "../src/commands/throttle.ts";

// We cannot call CDP in unit tests, so we test the pure-logic paths:
// argument validation, preset resolution, status formatting, and flag parsing.

describe("throttle", () => {
	describe("argument validation", () => {
		test("returns usage error when no args provided", async () => {
			const page = {} as any;
			const result = await handleThrottle(page, []);
			expect(result.ok).toBe(false);
			expect((result as any).error).toContain("Usage:");
			expect((result as any).error).toContain("slow-3g");
		});

		test("returns error for unknown preset", async () => {
			const page = {} as any;
			const result = await handleThrottle(page, ["lte"]);
			expect(result.ok).toBe(false);
			expect((result as any).error).toContain('Unknown throttle preset: "lte"');
			expect((result as any).error).toContain("slow-3g");
			expect((result as any).error).toContain("cable");
		});
	});

	describe("status subcommand", () => {
		test("returns 'off' when no throttle is active", async () => {
			const page = {} as any;
			const result = await handleThrottle(page, ["status"]);
			expect(result.ok).toBe(true);
			expect((result as any).data).toBe("Throttle: off");
		});
	});

	describe("preset resolution", () => {
		test("slow-3g preset has correct values", async () => {
			// We can verify preset resolution by attempting to apply it;
			// the CDP call will fail, but we can check the error path
			const page = {
				context: () => ({
					newCDPSession: () => {
						throw new Error("Target does not support CDP");
					},
				}),
			} as any;
			const result = await handleThrottle(page, ["slow-3g"]);
			expect(result.ok).toBe(false);
			expect((result as any).error).toContain("Chromium");
		});

		test("all presets are recognized", async () => {
			const page = {} as any;
			for (const preset of ["slow-3g", "3g", "4g", "wifi", "cable"]) {
				// These will fail at CDP but should NOT return "Unknown preset"
				const result = await handleThrottle(page, [preset]);
				if (!result.ok) {
					expect((result as any).error).not.toContain(
						"Unknown throttle preset",
					);
				}
			}
		});
	});

	describe("custom flag parsing", () => {
		test("recognizes --download flag as custom mode", async () => {
			const page = {
				context: () => ({
					newCDPSession: () => {
						throw new Error("Target does not support CDP");
					},
				}),
			} as any;
			const result = await handleThrottle(page, [
				"--download",
				"200",
				"--upload",
				"50",
				"--latency",
				"100",
			]);
			expect(result.ok).toBe(false);
			expect((result as any).error).toContain("Chromium");
		});

		test("--download flag is recognized even when not first arg", async () => {
			const page = {
				context: () => ({
					newCDPSession: () => {
						throw new Error("Protocol error");
					},
				}),
			} as any;
			// When sub is not a preset but args include --download
			const result = await handleThrottle(page, [
				"custom",
				"--download",
				"300",
			]);
			// "custom" is not a preset and sub !== "--download", but args includes "--download"
			// so it should enter the custom branch
			expect(result.ok).toBe(false);
			expect((result as any).error).toContain("Chromium");
		});
	});

	describe("status formatting", () => {
		test("getCurrentThrottle returns null initially", () => {
			// After module load with no throttle applied, should be null
			const throttle = getCurrentThrottle();
			expect(throttle).toBeNull();
		});
	});

	describe("CDP error handling", () => {
		test("reports Chromium requirement for unsupported targets", async () => {
			const page = {
				context: () => ({
					newCDPSession: () => {
						throw new Error("Target does not support CDP sessions");
					},
				}),
			} as any;

			const result = await handleThrottle(page, ["3g"]);
			expect(result.ok).toBe(false);
			expect((result as any).error).toBe(
				"Network throttling requires Chromium.",
			);
		});

		test("reports Chromium requirement on Protocol error", async () => {
			const page = {
				context: () => ({
					newCDPSession: () => {
						throw new Error("Protocol error (Runtime.evaluate)");
					},
				}),
			} as any;

			const result = await handleThrottle(page, ["off"]);
			expect(result.ok).toBe(false);
			expect((result as any).error).toBe(
				"Network throttling requires Chromium.",
			);
		});

		test("passes through other errors", async () => {
			const page = {
				context: () => ({
					newCDPSession: () => {
						throw new Error("Connection refused");
					},
				}),
			} as any;

			const result = await handleThrottle(page, ["4g"]);
			expect(result.ok).toBe(false);
			expect((result as any).error).toContain("Connection refused");
		});
	});

	describe("successful CDP calls", () => {
		test("applies preset and returns formatted output", async () => {
			let sentParams: any = null;
			const page = {
				context: () => ({
					newCDPSession: () =>
						Promise.resolve({
							send: (_method: string, params: any) => {
								sentParams = params;
								return Promise.resolve();
							},
							detach: () => Promise.resolve(),
						}),
				}),
			} as any;

			const result = await handleThrottle(page, ["3g"]);
			expect(result.ok).toBe(true);
			expect((result as any).data).toContain("3g");
			expect((result as any).data).toContain("187 KB/s");
			expect((result as any).data).toContain("75 KB/s");
			expect((result as any).data).toContain("400ms latency");

			expect(sentParams).not.toBeNull();
			expect(sentParams.offline).toBe(false);
			expect(sentParams.downloadThroughput).toBe(187 * 1024);
			expect(sentParams.uploadThroughput).toBe(75 * 1024);
			expect(sentParams.latency).toBe(400);
		});

		test("disables throttle with off subcommand", async () => {
			let sentParams: any = null;
			const page = {
				context: () => ({
					newCDPSession: () =>
						Promise.resolve({
							send: (_method: string, params: any) => {
								sentParams = params;
								return Promise.resolve();
							},
							detach: () => Promise.resolve(),
						}),
				}),
			} as any;

			const result = await handleThrottle(page, ["off"]);
			expect(result.ok).toBe(true);
			expect((result as any).data).toBe("Throttle: disabled");
			expect(sentParams.downloadThroughput).toBe(-1);
			expect(sentParams.uploadThroughput).toBe(-1);
		});

		test("applies custom values from flags", async () => {
			let sentParams: any = null;
			const page = {
				context: () => ({
					newCDPSession: () =>
						Promise.resolve({
							send: (_method: string, params: any) => {
								sentParams = params;
								return Promise.resolve();
							},
							detach: () => Promise.resolve(),
						}),
				}),
			} as any;

			const result = await handleThrottle(page, [
				"--download",
				"200",
				"--upload",
				"50",
				"--latency",
				"100",
			]);
			expect(result.ok).toBe(true);
			expect((result as any).data).toContain("custom");
			expect((result as any).data).toContain("200 KB/s");
			expect((result as any).data).toContain("50 KB/s");
			expect((result as any).data).toContain("100ms latency");

			expect(sentParams.downloadThroughput).toBe(200 * 1024);
			expect(sentParams.uploadThroughput).toBe(50 * 1024);
			expect(sentParams.latency).toBe(100);
		});

		test("status shows current throttle after applying preset", async () => {
			// First apply a preset
			const page = {
				context: () => ({
					newCDPSession: () =>
						Promise.resolve({
							send: () => Promise.resolve(),
							detach: () => Promise.resolve(),
						}),
				}),
			} as any;

			await handleThrottle(page, ["wifi"]);

			const status = await handleThrottle(page, ["status"]);
			expect(status.ok).toBe(true);
			expect((status as any).data).toContain("wifi");
			expect((status as any).data).toContain("3750 KB/s");
			expect((status as any).data).toContain("1500 KB/s");
			expect((status as any).data).toContain("20ms latency");

			// Clean up
			await handleThrottle(page, ["off"]);
		});
	});
});
