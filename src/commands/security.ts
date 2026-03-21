import type { BrowserContext, Page } from "playwright";
import type { RingBuffer } from "../buffers.ts";
import type { Response } from "../protocol.ts";
import type { NetworkEntry } from "./network.ts";

export type SecurityDeps = {
	context: BrowserContext;
	networkBuffer: RingBuffer<NetworkEntry>;
};

type HeaderCheck = {
	header: string;
	value: string | null;
	status: "pass" | "warn" | "fail";
	recommendation: string;
};

type CookieCheck = {
	name: string;
	domain: string;
	secure: boolean;
	httpOnly: boolean;
	sameSite: string;
	issues: string[];
};

type MixedContentItem = {
	url: string;
	method: string;
};

type SecurityReport = {
	url: string;
	headers: HeaderCheck[];
	cookies: CookieCheck[];
	mixedContent: MixedContentItem[];
	score: { pass: number; warn: number; fail: number };
};

const SECURITY_HEADERS: {
	header: string;
	check: (value: string | null) => "pass" | "warn" | "fail";
	recommendation: string;
}[] = [
	{
		header: "strict-transport-security",
		check: (v) => {
			if (!v) return "fail";
			return v.includes("max-age") ? "pass" : "warn";
		},
		recommendation:
			"Add Strict-Transport-Security header with max-age (e.g., max-age=31536000; includeSubDomains)",
	},
	{
		header: "content-security-policy",
		check: (v) => {
			if (!v) return "warn";
			return v.includes("unsafe-inline") || v.includes("unsafe-eval")
				? "warn"
				: "pass";
		},
		recommendation:
			"Add Content-Security-Policy header. Avoid unsafe-inline and unsafe-eval.",
	},
	{
		header: "x-content-type-options",
		check: (v) => (v === "nosniff" ? "pass" : "fail"),
		recommendation: "Set X-Content-Type-Options: nosniff",
	},
	{
		header: "x-frame-options",
		check: (v) => {
			if (!v) return "warn";
			return v === "DENY" || v === "SAMEORIGIN" ? "pass" : "warn";
		},
		recommendation: "Set X-Frame-Options to DENY or SAMEORIGIN",
	},
	{
		header: "referrer-policy",
		check: (v) => {
			if (!v) return "warn";
			const safe = [
				"no-referrer",
				"same-origin",
				"strict-origin",
				"strict-origin-when-cross-origin",
			];
			return safe.includes(v) ? "pass" : "warn";
		},
		recommendation:
			"Set Referrer-Policy to strict-origin-when-cross-origin or stricter",
	},
	{
		header: "permissions-policy",
		check: (v) => (v ? "pass" : "warn"),
		recommendation:
			"Add Permissions-Policy header to restrict browser features",
	},
];

export function formatSecurityReport(report: SecurityReport): string {
	const lines: string[] = [];

	lines.push(`Security Audit: ${report.url}`);
	lines.push("");

	// Headers
	lines.push("Security Headers:");
	for (const h of report.headers) {
		const icon =
			h.status === "pass" ? "PASS" : h.status === "warn" ? "WARN" : "FAIL";
		const value = h.value ? `"${h.value}"` : "(missing)";
		lines.push(`  [${icon}] ${h.header}: ${value}`);
		if (h.status !== "pass") {
			lines.push(`         ${h.recommendation}`);
		}
	}
	lines.push("");

	// Cookies
	if (report.cookies.length > 0) {
		lines.push("Cookie Security:");
		for (const c of report.cookies) {
			if (c.issues.length === 0) {
				lines.push(`  [PASS] ${c.name} (${c.domain})`);
			} else {
				lines.push(`  [WARN] ${c.name} (${c.domain})`);
				for (const issue of c.issues) {
					lines.push(`         ${issue}`);
				}
			}
		}
	} else {
		lines.push("Cookie Security: No cookies found.");
	}
	lines.push("");

	// Mixed content
	if (report.mixedContent.length > 0) {
		lines.push(
			`Mixed Content: ${report.mixedContent.length} insecure resource${report.mixedContent.length === 1 ? "" : "s"} detected`,
		);
		for (const m of report.mixedContent) {
			lines.push(`  [FAIL] ${m.method} ${m.url}`);
		}
	} else {
		lines.push("Mixed Content: None detected.");
	}
	lines.push("");

	// Summary
	const { pass, warn, fail } = report.score;
	lines.push(`Summary: ${pass} passed, ${warn} warnings, ${fail} failures`);

	return lines.join("\n");
}

export function auditCookies(
	cookies: {
		name: string;
		domain: string;
		secure: boolean;
		httpOnly: boolean;
		sameSite: string;
	}[],
	isHttps: boolean,
): CookieCheck[] {
	return cookies.map((c) => {
		const issues: string[] = [];

		if (isHttps && !c.secure) {
			issues.push("Missing Secure flag (cookie sent over HTTP)");
		}
		if (!c.httpOnly) {
			issues.push("Missing HttpOnly flag (accessible to JavaScript)");
		}
		if (!c.sameSite || c.sameSite === "None") {
			issues.push(`SameSite=${c.sameSite || "not set"} (vulnerable to CSRF)`);
		}

		return {
			name: c.name,
			domain: c.domain,
			secure: c.secure,
			httpOnly: c.httpOnly,
			sameSite: c.sameSite || "not set",
			issues,
		};
	});
}

export function detectMixedContent(
	pageUrl: string,
	networkEntries: NetworkEntry[],
): MixedContentItem[] {
	if (!pageUrl.startsWith("https://")) return [];

	return networkEntries
		.filter((e) => e.url.startsWith("http://"))
		.map((e) => ({ url: e.url, method: e.method }));
}

export async function handleSecurity(
	page: Page,
	args: string[],
	deps: SecurityDeps,
	options?: { json?: boolean },
): Promise<Response> {
	const jsonOutput = options?.json ?? args.includes("--json");

	try {
		const pageUrl = page.url();

		// Get response headers by fetching the current page URL from within the page
		const headers = await page.evaluate(async (url) => {
			try {
				const resp = await fetch(url, { method: "HEAD", mode: "no-cors" });
				const result: Record<string, string> = {};
				resp.headers.forEach((value, key) => {
					result[key.toLowerCase()] = value;
				});
				return result;
			} catch {
				return {} as Record<string, string>;
			}
		}, pageUrl);

		// Audit security headers
		const headerChecks: HeaderCheck[] = SECURITY_HEADERS.map((spec) => {
			const value = headers[spec.header] ?? null;
			return {
				header: spec.header,
				value,
				status: spec.check(value),
				recommendation: spec.recommendation,
			};
		});

		// Audit cookies (scoped to current page URL)
		const cookies = await deps.context.cookies(pageUrl);
		const isHttps = pageUrl.startsWith("https://");
		const cookieChecks = auditCookies(
			cookies.map((c) => ({
				name: c.name,
				domain: c.domain,
				secure: c.secure,
				httpOnly: c.httpOnly,
				sameSite: c.sameSite,
			})),
			isHttps,
		);

		// Detect mixed content — only consider entries from the current navigation
		const navTimestamp = await page
			.evaluate(() => Math.floor(performance.timeOrigin))
			.catch(() => 0);
		const allEntries = deps.networkBuffer.peek();
		const networkEntries =
			navTimestamp > 0
				? allEntries.filter((e) => e.timestamp >= navTimestamp)
				: allEntries;
		const mixedContent = detectMixedContent(pageUrl, networkEntries);

		// Calculate score
		let pass = 0;
		let warn = 0;
		let fail = 0;
		for (const h of headerChecks) {
			if (h.status === "pass") pass++;
			else if (h.status === "warn") warn++;
			else fail++;
		}
		for (const c of cookieChecks) {
			if (c.issues.length === 0) pass++;
			else warn++;
		}
		if (mixedContent.length > 0) fail++;
		else pass++;

		const report: SecurityReport = {
			url: pageUrl,
			headers: headerChecks,
			cookies: cookieChecks,
			mixedContent,
			score: { pass, warn, fail },
		};

		if (jsonOutput) {
			return { ok: true, data: JSON.stringify(report) };
		}

		return { ok: true, data: formatSecurityReport(report) };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `Security audit failed: ${message}` };
	}
}
