import type { StepResult } from "./flow-runner.ts";

export type WebhookPayload = {
	type: "flow" | "healthcheck";
	name?: string;
	status: "passed" | "failed";
	summary: {
		total: number;
		passed: number;
		failed: number;
	};
	duration_ms: number;
	failures: { step?: number; page?: string; error: string }[];
	timestamp: string;
};

export type HealthcheckPageForWebhook = {
	name: string;
	url: string;
	passed: boolean;
	error?: string;
	assertionResults: { label: string; passed: boolean; reason?: string }[];
	consoleErrors: { text: string }[];
	consoleWarnings: { text: string }[];
};

/**
 * Parse the --webhook <url> flag from command arguments.
 */
export function parseWebhookFlag(args: string[]): {
	url?: string;
	error?: string;
} {
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--webhook") {
			if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
				return { error: "Missing value for --webhook. Provide a URL." };
			}
			return { url: args[i + 1] };
		}
	}
	return {};
}

/**
 * Format a flow result into a webhook payload.
 */
export function formatFlowWebhookPayload(
	flowName: string,
	results: StepResult[],
	durationMs: number,
): WebhookPayload {
	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;

	return {
		type: "flow",
		name: flowName,
		status: failed > 0 ? "failed" : "passed",
		summary: {
			total: results.length,
			passed,
			failed,
		},
		duration_ms: durationMs,
		failures: results
			.filter((r) => !r.passed)
			.map((r) => ({
				step: r.stepNum,
				error: r.error ?? `Step ${r.stepNum} failed`,
			})),
		timestamp: new Date().toISOString(),
	};
}

/**
 * Format a healthcheck result into a webhook payload.
 */
export function formatHealthcheckWebhookPayload(
	results: HealthcheckPageForWebhook[],
	durationMs: number,
): WebhookPayload {
	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;

	return {
		type: "healthcheck",
		status: failed > 0 ? "failed" : "passed",
		summary: {
			total: results.length,
			passed,
			failed,
		},
		duration_ms: durationMs,
		failures: results
			.filter((r) => !r.passed)
			.map((r) => {
				const errors: string[] = [];
				if (r.error) {
					errors.push(r.error);
				}
				for (const ar of r.assertionResults) {
					if (!ar.passed && ar.reason) {
						errors.push(`${ar.label}: ${ar.reason}`);
					}
				}
				return {
					page: r.name,
					error: errors.join("; ") || "Page check failed",
				};
			}),
		timestamp: new Date().toISOString(),
	};
}

/**
 * Send a webhook payload to the given URL. Fire-and-forget — does not throw.
 */
export async function sendWebhook(
	url: string,
	payload: unknown,
	headers?: Record<string, string>,
): Promise<void> {
	try {
		await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...headers,
			},
			body: JSON.stringify(payload),
		});
	} catch {
		// Fire-and-forget: swallow errors to avoid blocking the command
	}
}
