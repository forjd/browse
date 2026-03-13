/**
 * Ref registry — assignment, storage, resolution, and staleness tracking.
 *
 * Maps short identifiers (@e1, @e2, ...) to accessibility tree nodes,
 * allowing interaction commands to target elements without CSS selectors.
 */

export type AccessibilityNode = {
	role: string;
	name: string;
	children?: AccessibilityNode[];
	level?: number;
	value?: string;
	/** Extra attributes from the aria snapshot (e.g., "selected", "placeholder") */
	attrs?: Record<string, string>;
};

export type RefEntry = {
	ref: string;
	role: string;
	name: string;
	nthMatch: number;
	totalMatches: number;
};

export type SnapshotMode = "default" | "inclusive" | "full";

const INTERACTIVE_ROLES = new Set([
	"link",
	"button",
	"textbox",
	"searchbox",
	"combobox",
	"listbox",
	"checkbox",
	"radio",
	"slider",
	"spinbutton",
	"switch",
	"menuitem",
	"option",
	"tab",
]);

const STRUCTURAL_ROLES = new Set([
	"heading",
	"paragraph",
	"list",
	"listitem",
	"img",
	"image",
	"table",
	"cell",
	"row",
	"columnheader",
	"rowheader",
	"text",
]);

let currentRefs: Map<string, RefEntry> = new Map();
let refsGeneration = 0;
let stale = false;

export function isInteractive(role: string): boolean {
	return INTERACTIVE_ROLES.has(role);
}

export function isStructural(role: string): boolean {
	return STRUCTURAL_ROLES.has(role);
}

/**
 * Parse Playwright's ariaSnapshot YAML-like output into AccessibilityNode tree.
 *
 * Format:
 *   - role "name" [attrs]: text content
 *     - child role "name"
 */
export function parseAriaSnapshot(snapshot: string): AccessibilityNode[] {
	const lines = snapshot.split("\n");
	const root: AccessibilityNode[] = [];
	const stack: { node: AccessibilityNode; indent: number }[] = [];

	for (const line of lines) {
		if (line.trim() === "") continue;

		// Measure indent (number of leading spaces before the "- ")
		const indentMatch = line.match(/^(\s*)-\s/);
		if (!indentMatch) continue;

		const indent = indentMatch[1].length;
		const content = line.slice(indent + 2); // Skip "- "

		const node = parseLine(content);
		if (!node) continue;

		// Find parent based on indent level
		while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
			stack.pop();
		}

		if (stack.length === 0) {
			root.push(node);
		} else {
			const parent = stack[stack.length - 1].node;
			if (!parent.children) parent.children = [];
			parent.children.push(node);
		}

		stack.push({ node, indent });
	}

	return root;
}

function parseLine(content: string): AccessibilityNode | null {
	// Skip /url, /placeholder etc. metadata lines
	if (content.startsWith("/")) return null;

	// Pattern: role "name" [attrs]: extra text
	// or: role: text content
	// or: role "name" [attrs]
	// or: role "name"
	const match = content.match(
		/^(\w+)(?:\s+"([^"]*)")?(?:\s+\[([^\]]*)\])?(?::\s*(.*))?$/,
	);
	if (!match) return null;

	const role = match[1];
	let name = match[2] ?? "";
	const attrStr = match[3];
	const trailingText = match[4]?.trim() ?? "";

	// If no quoted name but has trailing text, use trailing text as name
	if (!name && trailingText) {
		// Remove surrounding quotes if present
		name = trailingText.replace(/^"(.*)"$/, "$1");
	}

	const attrs: Record<string, string> = {};
	if (attrStr) {
		for (const part of attrStr.split(/\s+/)) {
			const eqIdx = part.indexOf("=");
			if (eqIdx >= 0) {
				attrs[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
			} else {
				attrs[part] = "true";
			}
		}
	}

	const node: AccessibilityNode = { role, name, attrs };

	if (attrs.level) {
		node.level = Number.parseInt(attrs.level, 10);
	}

	return node;
}

/**
 * Assign refs to interactive elements found in the accessibility tree.
 * Returns the current ref map. Also updates the module-level registry.
 */
export function assignRefs(
	tree: AccessibilityNode | AccessibilityNode[],
	_mode: SnapshotMode,
): Map<string, RefEntry> {
	const newRefs = new Map<string, RefEntry>();
	const entries: { role: string; name: string }[] = [];

	const nodes = Array.isArray(tree) ? tree : (tree.children ?? [tree]);

	// Collect all interactive elements depth-first
	function walk(node: AccessibilityNode): void {
		if (isInteractive(node.role) && node.name) {
			entries.push({ role: node.role, name: node.name });
		}
		if (node.children) {
			for (const child of node.children) {
				walk(child);
			}
		}
	}

	for (const node of nodes) {
		walk(node);
	}

	// Count duplicates for each role+name pair
	const counts = new Map<string, number>();
	for (const entry of entries) {
		const key = `${entry.role}::${entry.name}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	// Assign refs with duplicate tracking
	const seen = new Map<string, number>();
	let refIndex = 1;

	for (const entry of entries) {
		const key = `${entry.role}::${entry.name}`;
		const nthMatch = seen.get(key) ?? 0;
		seen.set(key, nthMatch + 1);

		const ref = `@e${refIndex}`;
		newRefs.set(ref, {
			ref,
			role: entry.role,
			name: entry.name,
			nthMatch,
			totalMatches: counts.get(key) ?? 1,
		});
		refIndex++;
	}

	currentRefs = newRefs;
	refsGeneration++;
	stale = false;

	return newRefs;
}

/**
 * Resolve a ref string to its entry, or return an error.
 */
export function resolveRef(ref: string): RefEntry | { error: string } {
	if (stale) {
		return {
			error:
				"Refs are stale after navigation. Run 'browse snapshot' to refresh.",
		};
	}

	const entry = currentRefs.get(ref);
	if (!entry) {
		return {
			error: `Unknown ref: ${ref}. Run 'browse snapshot' to see available refs.`,
		};
	}

	return entry;
}

export function getRefs(): Map<string, RefEntry> {
	return currentRefs;
}

export function getRefsGeneration(): number {
	return refsGeneration;
}

export function isStale(): boolean {
	return stale;
}

export function markStale(): void {
	stale = true;
}

/**
 * Resolve a selector-or-ref string to a Playwright Locator.
 * If the string starts with @, resolve via the ref registry.
 * Otherwise, treat it as a CSS selector via page.locator().
 */
export function resolveLocator(
	page: import("playwright").Page,
	selectorOrRef: string,
): { locator: import("playwright").Locator } | { error: string } {
	if (!selectorOrRef.startsWith("@")) {
		return { locator: page.locator(selectorOrRef) };
	}

	const resolved = resolveRef(selectorOrRef);
	if ("error" in resolved) {
		return resolved;
	}

	const locator =
		resolved.totalMatches > 1
			? page
					.getByRole(
						resolved.role as Parameters<
							import("playwright").Page["getByRole"]
						>[0],
						{ name: resolved.name, exact: true },
					)
					.nth(resolved.nthMatch)
			: page.getByRole(
					resolved.role as Parameters<
						import("playwright").Page["getByRole"]
					>[0],
					{ name: resolved.name, exact: true },
				);

	return { locator };
}

export function clearRefs(): void {
	currentRefs = new Map();
	stale = false;
}
