import type { BrowserContext, Page } from "playwright";
import type { RingBuffer } from "../buffers.ts";
import type { BrowseConfig } from "../config.ts";
import type { StealthOpts } from "../daemon.ts";
import { parseVars, runFlow, type StepResult } from "../flow-runner.ts";
import type { Response } from "../protocol.ts";
import { formatFlowJUnit } from "../reporters.ts";
import { applyStealthScripts } from "../stealth.ts";
import type { ConsoleEntry } from "./console.ts";
import { handleLogin } from "./login.ts";
import type { NetworkEntry } from "./network.ts";

export type TestMatrixDeps = {
	consoleBuffer: RingBuffer<ConsoleEntry>;
	networkBuffer: RingBuffer<NetworkEntry>;
};

type RoleResult = {
	role: string;
	results: StepResult[];
	screenshots: string[];
	error?: string;
};

/**
 * Multi-role parallel testing: runs the same flow simultaneously across
 * sessions with different auth (roles/environments) and diffs the results.
 *
 * Usage:
 *   browse test-matrix --roles admin,viewer,guest --flow checkout
 *   browse test-matrix --roles admin,viewer --flow dashboard --env staging
 *   browse test-matrix --roles admin,viewer --flow dashboard --reporter junit
 */
export async function handleTestMatrix(
	config: BrowseConfig | null,
	_page: Page,
	args: string[],
	_deps: TestMatrixDeps,
	_sessionContext: BrowserContext,
	defaultContext: BrowserContext,
	stealthOpts?: StealthOpts,
): Promise<Response> {
	if (!config) {
		return {
			ok: false,
			error:
				"No browse.config.json found. Create one with flow and environment definitions.",
		};
	}

	// Parse args
	let rolesStr: string | undefined;
	let flowName: string | undefined;
	let envName: string | undefined;
	let reporter: string | undefined;
	const vars = parseVars(args);

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--roles") {
			rolesStr = args[i + 1];
			i++;
		} else if (arg === "--flow") {
			flowName = args[i + 1];
			i++;
		} else if (arg === "--env") {
			envName = args[i + 1];
			i++;
		} else if (arg === "--reporter") {
			reporter = args[i + 1];
			i++;
		}
	}

	if (!rolesStr || !flowName) {
		return {
			ok: false,
			error:
				"Usage: browse test-matrix --roles <role1,role2,...> --flow <flow-name> [--env <env>] [--reporter junit]\n\nRoles must correspond to environment names in browse.config.json.",
		};
	}

	const roles = rolesStr
		.split(",")
		.map((r) => r.trim())
		.filter(Boolean);
	if (roles.length < 2) {
		return {
			ok: false,
			error: "At least 2 roles are required for matrix testing.",
		};
	}

	// Validate flow exists
	const flows = config.flows ?? {};
	if (!(flowName in flows)) {
		const available = Object.keys(flows).join(", ");
		return {
			ok: false,
			error: `Unknown flow: '${flowName}'. Available: ${available}.`,
		};
	}
	const flow = flows[flowName];

	// Validate that each role has an environment config
	for (const role of roles) {
		const envKey = envName ? `${envName}-${role}` : role;
		if (!config.environments[envKey] && !config.environments[role]) {
			const available = Object.keys(config.environments).join(", ");
			return {
				ok: false,
				error: `No environment config for role '${role}' (tried '${envKey}' and '${role}'). Available environments: ${available}.`,
			};
		}
	}

	const startTime = Date.now();
	const roleResults: RoleResult[] = [];

	// Run each role in a separate isolated browser context in parallel
	const browser = defaultContext.browser();
	if (!browser) {
		return { ok: false, error: "Browser not available for matrix testing." };
	}

	const promises = roles.map(async (role) => {
		const envKey = config.environments[envName ? `${envName}-${role}` : ""]
			? `${envName}-${role}`
			: role;

		let isolatedContext: BrowserContext | undefined;
		try {
			// Create isolated context for this role
			const contextOpts: Record<string, unknown> = {
				viewport: { width: 1440, height: 900 },
			};
			if (stealthOpts) {
				contextOpts.userAgent = stealthOpts.userAgent;
			}
			isolatedContext = await browser.newContext(contextOpts);
			if (stealthOpts) {
				await applyStealthScripts(isolatedContext, stealthOpts);
			}

			const rolePage = await isolatedContext.newPage();

			// Log in with this role's environment
			const loginResult = await handleLogin(config, rolePage, [
				"--env",
				envKey,
			]);
			if (!loginResult.ok) {
				return {
					role,
					results: [],
					screenshots: [],
					error: `Login failed for role '${role}': ${loginResult.error}`,
				};
			}

			// Create buffers for this role's session
			const { RingBuffer } = await import("../buffers.ts");
			const consoleBuffer = new RingBuffer<ConsoleEntry>(500);
			const networkBuffer = new RingBuffer<NetworkEntry>(500);

			// Run the flow
			const { results, screenshots } = await runFlow(
				`${flowName}-${role}`,
				flow,
				vars,
				{
					page: rolePage,
					config,
					consoleBuffer,
					networkBuffer,
				},
				{ continueOnError: true },
			);

			return { role, results, screenshots };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				role,
				results: [],
				screenshots: [],
				error: message,
			};
		} finally {
			if (isolatedContext) {
				try {
					await isolatedContext.close();
				} catch {
					// Ignore close errors
				}
			}
		}
	});

	const resolvedResults = await Promise.all(promises);
	roleResults.push(...resolvedResults);

	const durationMs = Date.now() - startTime;

	// JUnit output
	if (reporter === "junit") {
		const allResults: StepResult[] = [];
		for (const rr of roleResults) {
			for (const r of rr.results) {
				allResults.push({
					...r,
					description: `[${rr.role}] ${r.description}`,
				});
			}
		}
		const junit = formatFlowJUnit(
			`test-matrix-${flowName}`,
			allResults,
			durationMs,
		);
		return { ok: true, data: junit };
	}

	// Format comparison report
	const lines: string[] = [];
	lines.push(
		`Test Matrix: ${flowName} × ${roles.length} roles (${Math.round(durationMs / 1000)}s)`,
	);
	lines.push("");

	let allPassed = true;

	for (const rr of roleResults) {
		if (rr.error) {
			lines.push(`  ✗ ${rr.role}: ERROR — ${rr.error}`);
			allPassed = false;
			continue;
		}

		const passed = rr.results.filter((r) => r.passed).length;
		const total = rr.results.length;
		const status = passed === total ? "✓" : "✗";
		if (passed !== total) allPassed = false;

		lines.push(`  ${status} ${rr.role}: ${passed}/${total} steps passed`);
		for (const r of rr.results) {
			if (!r.passed) {
				lines.push(`      ✗ Step ${r.stepNum}: ${r.description} — ${r.error}`);
			}
		}
	}

	// Diff section: compare results across roles
	lines.push("");
	lines.push("Differences:");

	const referenceRole = roleResults[0];
	let hasDiffs = false;

	if (referenceRole && !referenceRole.error) {
		for (let i = 1; i < roleResults.length; i++) {
			const other = roleResults[i];
			if (other.error) continue;

			const maxSteps = Math.max(
				referenceRole.results.length,
				other.results.length,
			);
			for (let s = 0; s < maxSteps; s++) {
				const refStep = referenceRole.results[s];
				const otherStep = other.results[s];

				if (!refStep || !otherStep) {
					hasDiffs = true;
					lines.push(
						`  Step ${s + 1}: ${referenceRole.role} ${refStep ? (refStep.passed ? "PASS" : "FAIL") : "N/A"} vs ${other.role} ${otherStep ? (otherStep.passed ? "PASS" : "FAIL") : "N/A"}`,
					);
				} else if (refStep.passed !== otherStep.passed) {
					hasDiffs = true;
					lines.push(
						`  Step ${s + 1} (${refStep.description}): ${referenceRole.role} ${refStep.passed ? "PASS" : "FAIL"} vs ${other.role} ${otherStep.passed ? "PASS" : "FAIL"}`,
					);
				}
			}
		}
	}

	if (!hasDiffs) {
		lines.push("  All roles produced identical results.");
	}

	if (allPassed) {
		return { ok: true, data: lines.join("\n") };
	}
	return { ok: false, error: lines.join("\n") };
}
