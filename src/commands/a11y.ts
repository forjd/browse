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
	options?: { json?: boolean },
): Promise<Response> {
	// Check for new sub-commands
	const sub = args[0];
	if (sub === "coverage") {
		const { computeA11yCoverage, formatCoverageReport } = await import(
			"../a11y-coverage.ts"
		);
		const result = await computeA11yCoverage(page);
		if (options?.json) return { ok: true, data: JSON.stringify(result) };
		return { ok: true, data: formatCoverageReport(result) };
	}

	if (sub === "tree") {
		try {
			const snapshot = await page.accessibility.snapshot({
				interestingOnly: false,
			});
			if (!snapshot) return { ok: true, data: "Empty accessibility tree" };
			if (options?.json)
				return { ok: true, data: JSON.stringify(snapshot, null, 2) };
			return { ok: true, data: formatA11yTree(snapshot, 0) };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: `Failed to export accessibility tree: ${message}`,
			};
		}
	}

	if (sub === "tab-order") {
		return auditTabOrder(page, options?.json ?? false);
	}

	if (sub === "headings") {
		return auditHeadings(page, options?.json ?? false);
	}

	let standard: string | undefined;
	const jsonOutput = options?.json ?? false;
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

type A11yNode = {
	role?: string;
	name?: string;
	children?: A11yNode[];
	focused?: boolean;
	level?: number;
};

function formatA11yTree(node: A11yNode, depth: number): string {
	const lines: string[] = [];
	const indent = "  ".repeat(depth);
	const role = node.role ?? "unknown";
	const name = node.name ? ` "${node.name}"` : "";
	const focused = node.focused ? " [focused]" : "";
	const level = node.level ? ` [level=${node.level}]` : "";
	lines.push(`${indent}${role}${name}${level}${focused}`);
	if (node.children) {
		for (const child of node.children) {
			lines.push(formatA11yTree(child, depth + 1));
		}
	}
	return lines.join("\n");
}

async function auditTabOrder(page: Page, json: boolean): Promise<Response> {
	const focusedElements: {
		index: number;
		role: string;
		name: string;
		visible: boolean;
	}[] = [];

	try {
		// Get all focusable elements
		const focusable = await page.evaluate(() => {
			const els = document.querySelectorAll(
				'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
			);
			return Array.from(els).map((el, i) => ({
				index: i,
				tag: el.tagName.toLowerCase(),
				role: el.getAttribute("role") ?? el.tagName.toLowerCase(),
				name:
					el.getAttribute("aria-label") ??
					(el as HTMLElement).innerText?.trim().slice(0, 40) ??
					"",
				hasTabIndex: el.hasAttribute("tabindex"),
				tabIndex: (el as HTMLElement).tabIndex,
			}));
		});

		// Tab through elements (up to 50)
		const maxTabs = Math.min(focusable.length, 50);
		for (let i = 0; i < maxTabs; i++) {
			await page.keyboard.press("Tab");
			const active = await page.evaluate(() => {
				const el = document.activeElement;
				if (!el || el === document.body) return null;
				const computed = getComputedStyle(el);
				const hasOutline =
					computed.outlineStyle !== "none" && computed.outlineWidth !== "0px";
				const hasBorder = computed.borderStyle !== "none";
				return {
					tag: el.tagName.toLowerCase(),
					role: el.getAttribute("role") ?? el.tagName.toLowerCase(),
					name:
						el.getAttribute("aria-label") ??
						(el as HTMLElement).innerText?.trim().slice(0, 40) ??
						"",
					visible: hasOutline || hasBorder,
				};
			});

			if (active) {
				focusedElements.push({
					index: i + 1,
					role: active.role,
					name: active.name,
					visible: active.visible,
				});
			}
		}

		if (json) {
			return {
				ok: true,
				data: JSON.stringify({
					tabOrder: focusedElements,
					totalFocusable: focusable.length,
					noFocusIndicator: focusedElements.filter((e) => !e.visible).length,
				}),
			};
		}

		const lines = [`Keyboard Tab Order (${focusedElements.length} elements):`];
		for (const el of focusedElements) {
			const vis = el.visible ? "visible focus" : "NO visible focus indicator";
			lines.push(`  ${el.index}. [${el.role}] "${el.name}" — ${vis}`);
		}

		const noVis = focusedElements.filter((e) => !e.visible).length;
		const unreachable = focusable.length - focusedElements.length;

		lines.push("");
		if (noVis > 0) {
			lines.push(`[WARN] ${noVis} element(s) have no visible focus indicator`);
		}
		if (unreachable > 0) {
			lines.push(
				`[WARN] ${unreachable} focusable element(s) not reached by Tab`,
			);
		}
		if (noVis === 0 && unreachable === 0) {
			lines.push("[PASS] All elements reachable with visible focus");
		}

		return { ok: true, data: lines.join("\n") };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `Tab order audit failed: ${message}` };
	}
}

async function auditHeadings(page: Page, json: boolean): Promise<Response> {
	const headings = await page.evaluate(() => {
		const result: { level: number; text: string }[] = [];
		for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
			for (const el of document.querySelectorAll(tag)) {
				result.push({
					level: Number.parseInt(tag[1], 10),
					text: (el as HTMLElement).innerText?.trim().slice(0, 80) ?? "",
				});
			}
		}
		// Sort by document order
		return result;
	});

	// Check for issues
	const h1Count = headings.filter((h) => h.level === 1).length;
	const issues: string[] = [];

	if (h1Count === 0) issues.push("No H1 found");
	else if (h1Count > 1) issues.push(`Multiple H1 tags (${h1Count})`);

	for (let i = 1; i < headings.length; i++) {
		if (headings[i].level > headings[i - 1].level + 1) {
			issues.push(
				`Heading skip: H${headings[i - 1].level} -> H${headings[i].level} at "${headings[i].text.slice(0, 30)}"`,
			);
		}
	}

	if (json) {
		return {
			ok: true,
			data: JSON.stringify({ headings, issues }),
		};
	}

	const lines = ["Heading Hierarchy:"];
	for (const h of headings) {
		const indent = "  ".repeat(h.level);
		lines.push(`${indent}H${h.level}: ${h.text}`);
	}
	lines.push("");
	if (issues.length > 0) {
		for (const issue of issues) {
			lines.push(`[WARN] ${issue}`);
		}
	} else {
		lines.push("[PASS] Heading hierarchy is correct");
	}

	return { ok: true, data: lines.join("\n") };
}
