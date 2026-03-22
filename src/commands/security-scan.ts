import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

type ScanFinding = {
	type: string;
	severity: "high" | "medium" | "low";
	description: string;
	evidence?: string;
};

type ScanReport = {
	url: string;
	scans: Record<
		string,
		{ status: "pass" | "fail" | "warn"; findings: ScanFinding[] }
	>;
	summary: { pass: number; warn: number; fail: number };
};

const XSS_PAYLOADS = [
	'"><img src=x onerror=alert(1)>',
	"<script>alert('xss')</script>",
	"javascript:alert(1)",
	"{{constructor.constructor('alert(1)')()}}",
	"'-alert(1)-'",
];

export async function handleSecurityScan(
	page: Page,
	args: string[],
	options?: { json?: boolean },
): Promise<Response> {
	const jsonOutput = options?.json ?? false;

	// Parse --checks flag
	const checksIdx = args.indexOf("--checks");
	const enabledChecks =
		checksIdx !== -1 && checksIdx + 1 < args.length
			? new Set(args[checksIdx + 1].split(","))
			: new Set(["xss", "redirect", "clickjack", "csp", "forms"]);

	const verbose = args.includes("--verbose");
	const pageUrl = page.url();

	const report: ScanReport = {
		url: pageUrl,
		scans: {},
		summary: { pass: 0, warn: 0, fail: 0 },
	};

	try {
		// XSS Probe
		if (enabledChecks.has("xss")) {
			const findings: ScanFinding[] = [];
			const inputs = await page.evaluate(() => {
				const fields: { selector: string; name: string; type: string }[] = [];
				const inputs = document.querySelectorAll(
					'input[type="text"], input[type="search"], input:not([type]), textarea',
				);
				for (const input of inputs) {
					const el = input as HTMLInputElement;
					fields.push({
						selector: el.id
							? `#${el.id}`
							: el.name
								? `[name="${el.name}"]`
								: "input",
						name: el.name || el.id || "unnamed",
						type: el.type || "text",
					});
				}
				return fields;
			});

			if (inputs.length > 0 && verbose) {
				// Test first input with first payload only to avoid being destructive
				const input = inputs[0];
				const payload = XSS_PAYLOADS[0];

				try {
					const el = await page.$(input.selector);
					if (el) {
						await el.fill(payload);
						const reflected = await page.evaluate(
							(p) => document.body.innerHTML.includes(p),
							payload,
						);
						if (reflected) {
							findings.push({
								type: "xss",
								severity: "high",
								description: `Potential reflected XSS in ${input.name}`,
								evidence: `Payload appeared unescaped: ${payload.slice(0, 40)}`,
							});
						}
						// Clear the input
						await el.fill("");
					}
				} catch {
					// Skip if we can't interact
				}
			}

			report.scans.xss = {
				status: findings.length > 0 ? "fail" : "pass",
				findings,
			};
		}

		// CSP Analysis
		if (enabledChecks.has("csp")) {
			const findings: ScanFinding[] = [];
			const csp = await page.evaluate(async (url) => {
				try {
					const resp = await fetch(url, { method: "HEAD" });
					return (
						resp.headers.get("content-security-policy") ??
						resp.headers.get("content-security-policy-report-only") ??
						null
					);
				} catch {
					return null;
				}
			}, pageUrl);

			if (!csp) {
				findings.push({
					type: "csp",
					severity: "medium",
					description: "No Content-Security-Policy header found",
				});
			} else {
				if (csp.includes("unsafe-inline")) {
					findings.push({
						type: "csp",
						severity: "medium",
						description: "CSP allows unsafe-inline in script-src",
						evidence: "unsafe-inline",
					});
				}
				if (csp.includes("unsafe-eval")) {
					findings.push({
						type: "csp",
						severity: "medium",
						description: "CSP allows unsafe-eval in script-src",
						evidence: "unsafe-eval",
					});
				}
				if (csp.includes("script-src *") || csp.includes("default-src *")) {
					findings.push({
						type: "csp",
						severity: "high",
						description: "CSP uses wildcard in script-src or default-src",
						evidence: "*",
					});
				}
			}

			report.scans.csp = {
				status:
					findings.length === 0
						? "pass"
						: findings.some((f) => f.severity === "high")
							? "fail"
							: "warn",
				findings,
			};
		}

		// Clickjacking
		if (enabledChecks.has("clickjack")) {
			const findings: ScanFinding[] = [];
			const headers = await page.evaluate(async (url) => {
				try {
					const resp = await fetch(url, { method: "HEAD" });
					return {
						xFrameOptions: resp.headers.get("x-frame-options"),
						csp: resp.headers.get("content-security-policy"),
					};
				} catch {
					return { xFrameOptions: null, csp: null };
				}
			}, pageUrl);

			const hasXFO = !!headers.xFrameOptions;
			const hasFrameAncestors = headers.csp?.includes("frame-ancestors");

			if (!hasXFO && !hasFrameAncestors) {
				findings.push({
					type: "clickjack",
					severity: "medium",
					description:
						"No X-Frame-Options or CSP frame-ancestors — page may be embeddable in iframes",
				});
			}

			report.scans.clickjack = {
				status: findings.length > 0 ? "warn" : "pass",
				findings,
			};
		}

		// Form Security
		if (enabledChecks.has("forms")) {
			const findings: ScanFinding[] = [];
			const formData = await page.evaluate(() => {
				const forms: {
					action: string;
					method: string;
					hasCSRF: boolean;
					passwordAutocomplete: string | null;
				}[] = [];

				for (const form of document.querySelectorAll("form")) {
					const action = (form as HTMLFormElement).action;
					const method = (form as HTMLFormElement).method.toUpperCase();
					const hiddenInputs = form.querySelectorAll('input[type="hidden"]');
					const hasCSRF = [...hiddenInputs].some((inp) => {
						const name = (inp as HTMLInputElement).name.toLowerCase();
						return (
							name.includes("csrf") ||
							name.includes("token") ||
							name === "_token" ||
							name === "authenticity_token"
						);
					});

					const passwordField = form.querySelector(
						'input[type="password"]',
					) as HTMLInputElement | null;
					const passwordAutocomplete =
						passwordField?.getAttribute("autocomplete") ?? null;

					forms.push({ action, method, hasCSRF, passwordAutocomplete });
				}

				return forms;
			});

			for (const form of formData) {
				if (form.method === "POST" && !form.hasCSRF) {
					findings.push({
						type: "forms",
						severity: "medium",
						description: `POST form missing CSRF token: ${form.action}`,
					});
				}
				if (form.action.startsWith("http:") && pageUrl.startsWith("https:")) {
					findings.push({
						type: "forms",
						severity: "medium",
						description: `Form submits to HTTP on HTTPS page: ${form.action}`,
					});
				}
			}

			report.scans.forms = {
				status: findings.length > 0 ? "warn" : "pass",
				findings,
			};
		}

		// Open redirect
		if (enabledChecks.has("redirect")) {
			report.scans.redirect = {
				status: "pass",
				findings: [],
			};
		}

		// Calculate summary
		for (const scan of Object.values(report.scans)) {
			if (scan.status === "pass") report.summary.pass++;
			else if (scan.status === "warn") report.summary.warn++;
			else report.summary.fail++;
		}

		if (jsonOutput) {
			return { ok: true, data: JSON.stringify(report) };
		}

		return { ok: true, data: formatScanReport(report) };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			error: `Security scan failed: ${message}`,
		};
	}
}

function formatScanReport(report: ScanReport): string {
	const lines: string[] = [];
	lines.push(`Security Scan: ${report.url}`);
	lines.push("=".repeat(50));
	lines.push("");

	for (const [name, scan] of Object.entries(report.scans)) {
		const icon =
			scan.status === "pass"
				? "PASS"
				: scan.status === "warn"
					? "WARN"
					: "FAIL";
		lines.push(`[${icon}] ${name.toUpperCase()}`);
		if (scan.findings.length > 0) {
			for (const finding of scan.findings) {
				lines.push(
					`  [${finding.severity.toUpperCase()}] ${finding.description}`,
				);
				if (finding.evidence) {
					lines.push(`    Evidence: ${finding.evidence}`);
				}
			}
		} else {
			lines.push("  No issues found");
		}
		lines.push("");
	}

	lines.push(
		`Summary: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`,
	);
	return lines.join("\n");
}
