import type { BrowserContext, Page } from "playwright";
import type { RingBuffer } from "../buffers.ts";
import type { Response } from "../protocol.ts";
import { classifyCookie, classifyDomain } from "../tracker-database.ts";
import type { NetworkEntry } from "./network.ts";

export type ComplianceDeps = {
	context: BrowserContext;
	networkBuffer: RingBuffer<NetworkEntry>;
};

type ComplianceCheck = {
	category: string;
	name: string;
	status: "pass" | "fail" | "warn";
	details?: string;
};

type ComplianceReport = {
	url: string;
	standard: string;
	checks: ComplianceCheck[];
	violations: number;
};

export async function handleCompliance(
	page: Page,
	args: string[],
	deps: ComplianceDeps,
	options?: { json?: boolean },
): Promise<Response> {
	const jsonOutput = options?.json ?? false;

	// Parse --standard flag
	const stdIdx = args.indexOf("--standard");
	const standard =
		stdIdx !== -1 && stdIdx + 1 < args.length ? args[stdIdx + 1] : "gdpr";

	const validStandards = ["gdpr", "ccpa", "eprivacy"];
	if (!validStandards.includes(standard)) {
		return {
			ok: false,
			error: `Unknown standard: "${standard}". Supported: ${validStandards.join(", ")}`,
		};
	}

	// Navigate to URL if provided
	const targetUrl = args.find((a) => a.startsWith("http"));
	if (targetUrl) {
		await page.goto(targetUrl, {
			waitUntil: "networkidle",
			timeout: 30_000,
		});
	}

	const pageUrl = page.url();
	const checks: ComplianceCheck[] = [];

	try {
		// 1. Pre-consent cookie audit
		const cookies = await deps.context.cookies(pageUrl);
		const trackerCookies: {
			name: string;
			tracker: string;
			category: string;
		}[] = [];
		const essentialCookies: string[] = [];

		for (const cookie of cookies) {
			const classified = classifyCookie(cookie.name);
			if (classified) {
				trackerCookies.push({
					name: cookie.name,
					tracker: classified.tracker,
					category: classified.category,
				});
			} else {
				essentialCookies.push(cookie.name);
			}
		}

		if (trackerCookies.length > 0) {
			checks.push({
				category: "Pre-Consent Cookies",
				name: "Tracking cookies",
				status: "fail",
				details: `${trackerCookies.length} tracking cookie(s) found: ${trackerCookies.map((c) => `${c.name} (${c.tracker})`).join(", ")}`,
			});
		} else {
			checks.push({
				category: "Pre-Consent Cookies",
				name: "Tracking cookies",
				status: "pass",
				details: `${cookies.length} cookies found, none are known trackers`,
			});
		}

		// 2. Consent banner detection
		const bannerInfo = await page.evaluate(() => {
			// Check for common consent banner markers
			const markers = [
				"#onetrust-banner-sdk",
				"#CybotCookiebotDialog",
				"#cookie-consent",
				"#cookieConsent",
				"[data-cookieconsent]",
				".cookie-banner",
				".cookie-consent",
				"#gdpr-consent",
				".cc-banner",
			];

			for (const selector of markers) {
				const el = document.querySelector(selector);
				if (el && (el as HTMLElement).offsetParent !== null) {
					return {
						found: true,
						selector,
						hasRejectAll: false,
						hasAcceptAll: false,
					};
				}
			}

			// Fallback: look for dialog-like elements with cookie text
			const dialogs = document.querySelectorAll(
				'[role="dialog"], [role="alertdialog"], [class*="cookie"], [class*="consent"], [id*="cookie"], [id*="consent"]',
			);
			for (const dialog of dialogs) {
				const text = (dialog as HTMLElement).innerText?.toLowerCase() ?? "";
				if (
					text.includes("cookie") ||
					text.includes("consent") ||
					text.includes("privacy")
				) {
					// Check for accept/reject buttons
					const buttons = dialog.querySelectorAll("button, a[role='button']");
					let hasAccept = false;
					let hasReject = false;
					for (const btn of buttons) {
						const btnText = (btn as HTMLElement).innerText?.toLowerCase() ?? "";
						if (
							btnText.includes("accept") ||
							btnText.includes("agree") ||
							btnText.includes("allow")
						)
							hasAccept = true;
						if (
							btnText.includes("reject") ||
							btnText.includes("decline") ||
							btnText.includes("deny")
						)
							hasReject = true;
					}
					return {
						found: true,
						selector: "text-match",
						hasAcceptAll: hasAccept,
						hasRejectAll: hasReject,
					};
				}
			}

			return {
				found: false,
				selector: null,
				hasAcceptAll: false,
				hasRejectAll: false,
			};
		});

		if (bannerInfo.found) {
			checks.push({
				category: "Consent Banner",
				name: "Banner present",
				status: "pass",
				details: `Consent banner detected (${bannerInfo.selector})`,
			});

			if (!bannerInfo.hasRejectAll && standard === "gdpr") {
				checks.push({
					category: "Consent Banner",
					name: "Reject All option",
					status: "fail",
					details: 'GDPR requires a "Reject All" option with equal prominence',
				});
			} else if (bannerInfo.hasRejectAll) {
				checks.push({
					category: "Consent Banner",
					name: "Reject All option",
					status: "pass",
				});
			}
		} else {
			checks.push({
				category: "Consent Banner",
				name: "Banner present",
				status: standard === "gdpr" ? "fail" : "warn",
				details: "No cookie consent banner detected",
			});
		}

		// 3. Third-party tracker detection
		const networkEntries = deps.networkBuffer.peek();
		const trackerRequests: {
			url: string;
			tracker: string;
			category: string;
		}[] = [];

		for (const entry of networkEntries) {
			const classified = classifyDomain(entry.url);
			if (classified) {
				trackerRequests.push({
					url: entry.url,
					tracker: classified.tracker,
					category: classified.category,
				});
			}
		}

		if (trackerRequests.length > 0) {
			// Deduplicate by tracker name
			const unique = [
				...new Map(trackerRequests.map((t) => [t.tracker, t])).values(),
			];
			checks.push({
				category: "Third-Party Trackers",
				name: "Tracker requests",
				status: "fail",
				details: `${unique.length} tracker(s) detected: ${unique.map((t) => `${t.tracker} (${t.category})`).join(", ")}`,
			});
		} else {
			checks.push({
				category: "Third-Party Trackers",
				name: "Tracker requests",
				status: "pass",
				details: "No known third-party trackers detected",
			});
		}

		// 4. Privacy policy link
		const privacyLinks = await page.evaluate(() => {
			const links = document.querySelectorAll("a");
			const found: { text: string; href: string }[] = [];
			for (const link of links) {
				const text = (link as HTMLElement).innerText?.toLowerCase() ?? "";
				const href = (link as HTMLAnchorElement).href ?? "";
				if (
					text.includes("privacy") ||
					text.includes("cookie policy") ||
					href.includes("/privacy") ||
					href.includes("/cookie")
				) {
					found.push({ text: text.trim().slice(0, 50), href });
				}
			}
			return found;
		});

		if (privacyLinks.length > 0) {
			checks.push({
				category: "Privacy Policy",
				name: "Policy link",
				status: "pass",
				details: `Found: ${privacyLinks.map((l) => l.text || l.href).join(", ")}`,
			});
		} else {
			checks.push({
				category: "Privacy Policy",
				name: "Policy link",
				status: "fail",
				details: "No privacy policy or cookie policy link found",
			});
		}

		const violations = checks.filter((c) => c.status === "fail").length;
		const report: ComplianceReport = {
			url: pageUrl,
			standard: standard.toUpperCase(),
			checks,
			violations,
		};

		if (jsonOutput) {
			return { ok: true, data: JSON.stringify(report) };
		}

		return { ok: true, data: formatComplianceReport(report) };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			error: `Compliance audit failed: ${message}`,
		};
	}
}

function formatComplianceReport(report: ComplianceReport): string {
	const lines: string[] = [];
	lines.push(`Privacy Compliance Audit: ${report.url}`);
	lines.push(`Standard: ${report.standard}`);
	lines.push("=".repeat(50));
	lines.push("");

	const categories = new Map<string, ComplianceCheck[]>();
	for (const check of report.checks) {
		const list = categories.get(check.category) ?? [];
		list.push(check);
		categories.set(check.category, list);
	}

	for (const [cat, checks] of categories) {
		lines.push(cat);
		for (const check of checks) {
			const icon =
				check.status === "pass"
					? "PASS"
					: check.status === "warn"
						? "WARN"
						: "FAIL";
			let line = `  [${icon}] ${check.name}`;
			if (check.details) line += ` — ${check.details}`;
			lines.push(line);
		}
		lines.push("");
	}

	lines.push(`Summary: ${report.violations} violation(s) found`);
	return lines.join("\n");
}
