import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { resolveRef } from "../refs.ts";

const VALID_STANDARDS = new Set([
	"wcag2a",
	"wcag2aa",
	"wcag21a",
	"wcag21aa",
	"wcag22aa",
	"best-practice",
]);

const SEVERITY_ORDER = ["critical", "serious", "moderate", "minor"] as const;

type AxeNode = {
	html: string;
	target: string[];
	failureSummary?: string;
};

type AxeViolation = {
	id: string;
	impact?: string;
	description: string;
	help: string;
	helpUrl: string;
	nodes: AxeNode[];
};

type AxeBuilderFactory = (opts: { page: Page }) => {
	withTags: (tags: string[]) => unknown;
	include: (selector: string) => unknown;
	exclude: (selector: string) => unknown;
	analyze: () => Promise<{ violations: AxeViolation[] }>;
};

export async function handleA11y(
	page: Page,
	args: string[],
	axeFactory: AxeBuilderFactory = (opts) =>
		new AxeBuilder(opts) as ReturnType<AxeBuilderFactory>,
): Promise<Response> {
	let standard: string | undefined;
	let jsonOutput = false;
	let includeSelector: string | undefined;
	let excludeSelector: string | undefined;
	let refArg: string | undefined;

	// Parse flags
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--standard") {
			const value = args[i + 1];
			if (!value || value.startsWith("-")) {
				return {
					ok: false,
					error: "Missing value for --standard flag.",
				};
			}
			if (!VALID_STANDARDS.has(value)) {
				return {
					ok: false,
					error: `Invalid standard: "${value}". Valid options: ${[...VALID_STANDARDS].join(", ")}`,
				};
			}
			standard = value;
			i++;
		} else if (arg === "--json") {
			jsonOutput = true;
		} else if (arg === "--include") {
			const value = args[i + 1];
			if (!value || value.startsWith("-")) {
				return {
					ok: false,
					error: "Missing value for --include flag.",
				};
			}
			includeSelector = value;
			i++;
		} else if (arg === "--exclude") {
			const value = args[i + 1];
			if (!value || value.startsWith("-")) {
				return {
					ok: false,
					error: "Missing value for --exclude flag.",
				};
			}
			excludeSelector = value;
			i++;
		} else if (arg.startsWith("@")) {
			refArg = arg;
		}
	}

	// Resolve @ref to a CSS selector via the element's unique path
	if (refArg) {
		const resolved = resolveRef(refArg);
		if ("error" in resolved) {
			return { ok: false, error: resolved.error };
		}

		try {
			const locator =
				resolved.totalMatches > 1
					? page
							.getByRole(resolved.role as Parameters<Page["getByRole"]>[0], {
								name: resolved.name,
								exact: true,
							})
							.nth(resolved.nthMatch)
					: page.getByRole(resolved.role as Parameters<Page["getByRole"]>[0], {
							name: resolved.name,
							exact: true,
						});

			// Generate a unique CSS selector for the element
			const cssSelector = await locator.evaluate((el: Element) => {
				const parts: string[] = [];
				let current: Element | null = el;
				while (current && current !== document.documentElement) {
					let selector = current.tagName.toLowerCase();
					if (current.id) {
						selector = `#${current.id}`;
						parts.unshift(selector);
						break;
					}
					const parent = current.parentElement;
					if (parent) {
						const siblings = Array.from(parent.children).filter(
							(c) => c.tagName === current?.tagName,
						);
						if (siblings.length > 1) {
							const idx = siblings.indexOf(current) + 1;
							selector += `:nth-of-type(${idx})`;
						}
					}
					parts.unshift(selector);
					current = parent;
				}
				return parts.join(" > ");
			});

			includeSelector = cssSelector;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { ok: false, error: message };
		}
	}

	try {
		const builder = axeFactory({ page });

		if (standard) {
			builder.withTags([standard]);
		}
		if (includeSelector) {
			builder.include(includeSelector);
		}
		if (excludeSelector) {
			builder.exclude(excludeSelector);
		}

		const results = await builder.analyze();
		const violations = results.violations as AxeViolation[];

		if (jsonOutput) {
			return {
				ok: true,
				data: JSON.stringify({
					violations: violations.map((v) => ({
						id: v.id,
						impact: v.impact,
						description: v.description,
						help: v.help,
						helpUrl: v.helpUrl,
						nodes: v.nodes.length,
					})),
					summary: {
						total: violations.length,
						critical: violations.filter((v) => v.impact === "critical").length,
						serious: violations.filter((v) => v.impact === "serious").length,
						moderate: violations.filter((v) => v.impact === "moderate").length,
						minor: violations.filter((v) => v.impact === "minor").length,
					},
				}),
			};
		}

		if (violations.length === 0) {
			return { ok: true, data: "No accessibility violations found." };
		}

		return { ok: true, data: formatViolations(violations) };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}

function formatViolations(violations: AxeViolation[]): string {
	const lines: string[] = [];

	// Group by severity
	const grouped = new Map<string, AxeViolation[]>();
	for (const v of violations) {
		const impact = v.impact ?? "unknown";
		if (!grouped.has(impact)) {
			grouped.set(impact, []);
		}
		grouped.get(impact)?.push(v);
	}

	// Summary line
	const total = violations.length;
	const parts: string[] = [];
	for (const severity of SEVERITY_ORDER) {
		const count = grouped.get(severity)?.length ?? 0;
		if (count > 0) {
			parts.push(`${count} ${severity}`);
		}
	}
	lines.push(
		`${total} violation${total === 1 ? "" : "s"} found (${parts.join(", ")})`,
	);
	lines.push("");

	// Detail by severity
	for (const severity of SEVERITY_ORDER) {
		const group = grouped.get(severity);
		if (!group || group.length === 0) continue;

		lines.push(`[${severity.toUpperCase()}]`);
		for (const v of group) {
			const nodeCount = v.nodes.length;
			lines.push(
				`  ${v.id}: ${v.help} (${nodeCount} element${nodeCount === 1 ? "" : "s"})`,
			);
			// Show first few failing elements
			const maxNodes = 3;
			for (let i = 0; i < Math.min(nodeCount, maxNodes); i++) {
				const node = v.nodes[i];
				lines.push(`    ${node.target.join(", ")}: ${node.html}`);
			}
			if (nodeCount > maxNodes) {
				lines.push(`    ... and ${nodeCount - maxNodes} more`);
			}
			lines.push(`    ${v.helpUrl}`);
		}
		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
