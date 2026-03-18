/**
 * Fetch the full accessibility tree via CDP.
 *
 * Playwright's ariaSnapshot() uses "expect" mode which excludes generic-role
 * elements (<div>, <span>).  For "full" snapshot mode we need every node,
 * so we call Accessibility.getFullAXTree over a CDP session and convert
 * the flat node list into an AccessibilityNode tree.
 */

import type { Page } from "playwright";
import type { AccessibilityNode } from "./refs.ts";

/** Shape of a single node returned by Accessibility.getFullAXTree. */
export interface CDPAXNode {
	nodeId: string;
	ignored: boolean;
	role?: { type: string; value: string };
	name?: { type: string; value: string };
	childIds?: string[];
	properties?: Array<{
		name: string;
		value: { type: string; value: unknown };
	}>;
}

/**
 * Internal Chrome roles that add noise rather than useful structure.
 * Their children are promoted to the parent level.
 */
const SKIP_ROLES = new Set([
	"RootWebArea",
	"StaticText",
	"InlineTextBox",
	"LineBreak",
	"none",
	"presentation",
]);

/** Roles whose text content is collected into the parent name. */
const TEXT_ROLES = new Set(["StaticText"]);

/**
 * Convert a flat CDP AXNode array into an AccessibilityNode tree.
 *
 * - Nodes with `ignored: true` are removed but their children are promoted
 *   into the parent (they may contain non-ignored descendants).
 * - Nodes whose role is in SKIP_ROLES receive the same treatment: removed
 *   with children promoted into the parent.
 */
export function buildTree(cdpNodes: CDPAXNode[]): AccessibilityNode[] {
	if (cdpNodes.length === 0) return [];

	const nodeMap = new Map<string, CDPAXNode>();
	for (const n of cdpNodes) {
		nodeMap.set(n.nodeId, n);
	}

	// The first node is always the RootWebArea (document root).
	const root = cdpNodes[0];
	if (!root) return [];

	return convertChildren(root.childIds ?? [], nodeMap);
}

function convertChildren(
	childIds: string[],
	nodeMap: Map<string, CDPAXNode>,
): AccessibilityNode[] {
	const result: AccessibilityNode[] = [];
	for (const id of childIds) {
		const cdp = nodeMap.get(id);
		if (!cdp) continue;
		result.push(...convertNode(cdp, nodeMap));
	}
	return result;
}

function convertNode(
	cdp: CDPAXNode,
	nodeMap: Map<string, CDPAXNode>,
): AccessibilityNode[] {
	// Ignored nodes are not displayed but may contain non-ignored descendants.
	// Promote their children upward (same treatment as SKIP_ROLES).
	if (cdp.ignored) {
		return convertChildren(cdp.childIds ?? [], nodeMap);
	}

	const role = cdp.role?.value ?? "";
	let name = cdp.name?.value ?? "";
	const childIds = cdp.childIds ?? [];

	// Skip internal roles but promote children.
	if (SKIP_ROLES.has(role)) {
		return convertChildren(childIds, nodeMap);
	}

	// Collect text from StaticText children into this node's name when empty.
	// CDP stores text content as StaticText child nodes rather than in the
	// parent's accessible name (unlike Playwright's ariaSnapshot).
	if (!name && childIds.length > 0) {
		const textParts: string[] = [];
		for (const id of childIds) {
			const child = nodeMap.get(id);
			if (child && !child.ignored && TEXT_ROLES.has(child.role?.value ?? "")) {
				textParts.push(child.name?.value ?? "");
			}
		}
		if (textParts.length > 0) {
			name = textParts.join("").trim();
		}
	}

	const children = convertChildren(childIds, nodeMap);

	const node: AccessibilityNode = { role, name };
	if (children.length > 0) node.children = children;

	// Extract level (headings).
	const levelProp = cdp.properties?.find((p) => p.name === "level");
	if (levelProp && typeof levelProp.value.value === "number") {
		node.level = levelProp.value.value;
	}

	// Extract value (form controls).
	const valueProp = cdp.properties?.find((p) => p.name === "value");
	if (valueProp && typeof valueProp.value.value === "string") {
		node.value = valueProp.value.value;
	}

	return [node];
}

/**
 * Fetch the complete accessibility tree for the current page via CDP.
 * Returns AccessibilityNode[] compatible with the existing snapshot pipeline.
 */
export async function getFullAXTreeViaCDP(
	page: Page,
): Promise<AccessibilityNode[]> {
	const client = await page.context().newCDPSession(page);
	try {
		const result = await client.send("Accessibility.getFullAXTree");
		const nodes = (result as Record<string, unknown>)?.nodes;
		if (!Array.isArray(nodes)) {
			return [];
		}
		return buildTree(nodes as CDPAXNode[]);
	} finally {
		await client.detach();
	}
}
