import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright";
import type { RingBuffer } from "../buffers.ts";
import type { BrowseConfig } from "../config.ts";
import { interpolateVars, parseVars } from "../flow-runner.ts";
import type { Response } from "../protocol.ts";
import { compareScreenshots } from "../visual-diff.ts";
import type { ConsoleEntry } from "./console.ts";
import type { NetworkEntry } from "./network.ts";

export type DiffDeps = {
	consoleBuffer: RingBuffer<ConsoleEntry>;
	networkBuffer: RingBuffer<NetworkEntry>;
};

type PageDiffResult = {
	name: string;
	url: string;
	baselineScreenshot: string;
	currentScreenshot: string;
	similarity: number;
	diffPixels: number;
	totalPixels: number;
	diffImagePath?: string;
};

/**
 * Diff screenshots across two deployments (e.g., branches, environments).
 *
 * Usage:
 *   browse diff --baseline https://main.example.com --current https://feature.example.com --flow healthcheck
 *   browse diff --baseline https://staging.app --current http://localhost:3000 --flow smoke --threshold 5
 *
 * Takes screenshots at each page visited by the flow on both deployments,
 * then produces a visual diff report showing what changed.
 */
export async function handleDiff(
	config: BrowseConfig | null,
	page: Page,
	args: string[],
	_deps: DiffDeps,
	_context: BrowserContext,
): Promise<Response> {
	// Parse args
	let baselineUrl: string | undefined;
	let currentUrl: string | undefined;
	let flowName: string | undefined;
	let threshold = 10;
	let _noScreenshots = false;
	const vars = parseVars(args);

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--baseline") {
			baselineUrl = args[i + 1];
			i++;
		} else if (arg === "--current") {
			currentUrl = args[i + 1];
			i++;
		} else if (arg === "--flow") {
			flowName = args[i + 1];
			i++;
		} else if (arg === "--threshold") {
			const val = Number(args[i + 1]);
			if (!Number.isNaN(val)) threshold = val;
			i++;
		} else if (arg === "--no-screenshots") {
			_noScreenshots = true;
		}
	}

	if (!baselineUrl || !currentUrl) {
		return {
			ok: false,
			error:
				"Usage: browse diff --baseline <url> --current <url> [--flow <name>] [--threshold <n>]\n\nCompares screenshots between two deployments.",
		};
	}

	// If flow specified, validate it exists
	let flowPages: string[] = [];
	if (flowName) {
		if (!config?.flows?.[flowName]) {
			const available = config?.flows
				? Object.keys(config.flows).join(", ")
				: "none";
			return {
				ok: false,
				error: `Unknown flow: '${flowName}'. Available: ${available}.`,
			};
		}
		// Extract goto URLs from flow steps
		const flow = config.flows[flowName];
		for (const step of flow.steps) {
			if ("goto" in step) {
				flowPages.push(step.goto);
			}
		}
	}

	// If no flow, use healthcheck pages or just compare the base URLs
	if (flowPages.length === 0 && config?.healthcheck?.pages) {
		flowPages = config.healthcheck.pages.map((p) =>
			interpolateVars(p.url, vars),
		);
	}

	if (flowPages.length === 0) {
		// Just compare the two URLs directly
		flowPages = ["/"];
	}

	const diffDir = join(homedir(), ".bun-browse", "diffs");
	mkdirSync(diffDir, { recursive: true });
	const timestamp = Date.now();

	const results: PageDiffResult[] = [];

	for (let i = 0; i < flowPages.length; i++) {
		const relativePath = flowPages[i];
		const baseUrl = relativePath.startsWith("http")
			? relativePath
			: `${baselineUrl.replace(/\/$/, "")}${relativePath.startsWith("/") ? "" : "/"}${relativePath}`;
		const currUrl = relativePath.startsWith("http")
			? relativePath.replace(
					new URL(relativePath).origin,
					currentUrl.replace(/\/$/, ""),
				)
			: `${currentUrl.replace(/\/$/, "")}${relativePath.startsWith("/") ? "" : "/"}${relativePath}`;

		const pageName =
			relativePath.replace(/[^a-zA-Z0-9]/g, "-").replace(/^-|-$/g, "") ||
			"home";

		// Screenshot baseline
		const baselinePath = join(
			diffDir,
			`diff-${timestamp}-${pageName}-baseline.png`,
		);
		const currentPath = join(
			diffDir,
			`diff-${timestamp}-${pageName}-current.png`,
		);

		try {
			await page.goto(baseUrl, {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});
			await page.screenshot({ path: baselinePath, fullPage: true });
		} catch (err) {
			const _message = err instanceof Error ? err.message : String(err);
			results.push({
				name: pageName,
				url: baseUrl,
				baselineScreenshot: "",
				currentScreenshot: "",
				similarity: 0,
				diffPixels: 0,
				totalPixels: 0,
			});
			continue;
		}

		try {
			await page.goto(currUrl, {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});
			await page.screenshot({ path: currentPath, fullPage: true });
		} catch (err) {
			const _message = err instanceof Error ? err.message : String(err);
			results.push({
				name: pageName,
				url: currUrl,
				baselineScreenshot: baselinePath,
				currentScreenshot: "",
				similarity: 0,
				diffPixels: 0,
				totalPixels: 0,
			});
			continue;
		}

		// Compare screenshots
		try {
			const diffResult = compareScreenshots(
				currentPath,
				baselinePath,
				threshold,
			);
			results.push({
				name: pageName,
				url: relativePath,
				baselineScreenshot: baselinePath,
				currentScreenshot: currentPath,
				similarity: diffResult.similarity,
				diffPixels: diffResult.diffPixels,
				totalPixels: diffResult.totalPixels,
				diffImagePath: diffResult.diffImagePath,
			});
		} catch (err) {
			const _message = err instanceof Error ? err.message : String(err);
			results.push({
				name: pageName,
				url: relativePath,
				baselineScreenshot: baselinePath,
				currentScreenshot: currentPath,
				similarity: 0,
				diffPixels: 0,
				totalPixels: 0,
			});
		}
	}

	// Format report
	const lines: string[] = [];
	lines.push(`Visual Diff Report: ${baselineUrl} → ${currentUrl}`);
	lines.push(`Threshold: ${threshold}, Pages: ${results.length}`);
	lines.push("");

	let hasChanges = false;
	for (const result of results) {
		const isIdentical = result.similarity >= 99.9;
		const mark = isIdentical ? "✓" : "△";
		if (!isIdentical) hasChanges = true;

		lines.push(
			`  ${mark} ${result.name}: ${result.similarity.toFixed(1)}% similar`,
		);
		if (!isIdentical && result.diffPixels > 0) {
			lines.push(
				`    Changed pixels: ${result.diffPixels}/${result.totalPixels}`,
			);
		}
		if (result.diffImagePath) {
			lines.push(`    Diff: ${result.diffImagePath}`);
		}
		if (result.baselineScreenshot) {
			lines.push(`    Baseline: ${result.baselineScreenshot}`);
		}
		if (result.currentScreenshot) {
			lines.push(`    Current: ${result.currentScreenshot}`);
		}
	}

	if (!hasChanges) {
		lines.push("");
		lines.push("No visual differences detected.");
	}

	return { ok: true, data: lines.join("\n") };
}
