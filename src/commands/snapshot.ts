import type { Page } from "playwright";
import { getFullAXTreeViaCDP } from "../cdp-accessibility.ts";
import type { Response } from "../protocol.ts";
import {
	type AccessibilityNode,
	assignRefs,
	isInteractive,
	isStructural,
	parseAriaSnapshot,
	type RefEntry,
	type SnapshotMode,
} from "../refs.ts";

const MAX_OUTPUT_LENGTH = 10_000;

function parseMode(args: string[]): SnapshotMode {
	if (args.includes("-f")) return "full";
	if (args.includes("-i")) return "inclusive";
	return "default";
}

function shouldIncludeNode(
	node: AccessibilityNode,
	mode: SnapshotMode,
): boolean {
	if (mode === "full") return true;

	if (isInteractive(node.role)) {
		return node.name !== "";
	}

	if (mode === "inclusive") {
		return isStructural(node.role) && node.name !== "";
	}

	return false;
}

type JsonNode = {
	role: string;
	name: string;
	level?: number;
	children?: JsonNode[];
};

function filterNodes(
	nodes: AccessibilityNode[],
	mode: SnapshotMode,
): JsonNode[] {
	const result: JsonNode[] = [];

	for (const node of nodes) {
		if (shouldIncludeNode(node, mode)) {
			const jsonNode: JsonNode = { role: node.role, name: node.name };
			if (node.level) jsonNode.level = node.level;
			if (node.children) {
				const children = filterNodes(node.children, mode);
				if (children.length > 0) jsonNode.children = children;
			}
			result.push(jsonNode);
		} else if (node.children) {
			result.push(...filterNodes(node.children, mode));
		}
	}

	return result;
}

function formatTree(
	nodes: AccessibilityNode[],
	refMap: Map<string, RefEntry>,
	mode: SnapshotMode,
): string[] {
	const lines: string[] = [];
	const refLookup = new Map<string, number>();

	function walk(node: AccessibilityNode, depth: number): void {
		if (!shouldIncludeNode(node, mode)) {
			// Still walk children
			if (node.children) {
				for (const child of node.children) {
					walk(child, depth);
				}
			}
			return;
		}

		const indent = "  ".repeat(depth);
		const interactive = isInteractive(node.role);

		let line: string;

		if (interactive && node.name) {
			const key = `${node.role}::${node.name}`;
			const nthSeen = refLookup.get(key) ?? 0;
			refLookup.set(key, nthSeen + 1);

			// Find matching ref
			let matchingRef: string | undefined;
			for (const [ref, entry] of refMap) {
				if (
					entry.role === node.role &&
					entry.name === node.name &&
					entry.nthMatch === nthSeen
				) {
					matchingRef = ref;
					break;
				}
			}

			if (matchingRef) {
				const entry = refMap.get(matchingRef);
				const dupSuffix =
					entry && entry.totalMatches > 1
						? ` (${entry.nthMatch + 1} of ${entry.totalMatches})`
						: "";
				line = `${indent}${matchingRef} [${node.role}] "${node.name}"${dupSuffix}`;
			} else {
				line = `${indent}[${node.role}] "${node.name}"`;
			}
		} else {
			let roleDisplay = node.role;
			if (node.role === "heading" && node.level) {
				roleDisplay = `heading, level=${node.level}`;
			}
			if (node.name) {
				line = `${indent}[${roleDisplay}] "${node.name}"`;
			} else {
				line = `${indent}[${roleDisplay}]`;
			}
		}

		lines.push(line);

		if (node.children) {
			for (const child of node.children) {
				walk(child, depth + 1);
			}
		}
	}

	for (const node of nodes) {
		walk(node, 0);
	}

	return lines;
}

export async function handleSnapshot(
	page: Page,
	args: string[],
	options?: { json?: boolean },
): Promise<Response> {
	const mode = parseMode(args);

	try {
		// Full mode uses CDP to capture all nodes including generic containers.
		// Other modes use Playwright's ariaSnapshot which is more compact.
		let nodes: AccessibilityNode[];
		if (mode === "full") {
			nodes = await getFullAXTreeViaCDP(page);
		} else {
			const rawSnapshot = await page.locator("body").ariaSnapshot();
			nodes = parseAriaSnapshot(rawSnapshot);
		}

		// Assign refs to interactive elements
		const refs = assignRefs(nodes, mode);

		const title = await page.title();

		if (options?.json) {
			return {
				ok: true,
				data: JSON.stringify({
					title,
					nodes: filterNodes(nodes, mode),
				}),
			};
		}

		// Format the tree
		const lines = formatTree(nodes, refs, mode);

		// Build output with page header
		let output = `[page] "${title}"\n\n`;

		for (let i = 0; i < lines.length; i++) {
			const next = `${lines[i]}\n`;
			if (output.length + next.length > MAX_OUTPUT_LENGTH) {
				const remaining = lines.length - i;
				output += `[... ${remaining} more elements, use -f for full tree]\n`;
				break;
			}
			output += next;
		}

		return { ok: true, data: output.trimEnd() };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
