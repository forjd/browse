import { writeFileSync } from "node:fs";
import type { Page } from "playwright";
import {
	CrawlEngine,
	type CrawlOptions,
	type CrawlResult,
} from "../crawl-engine.ts";
import type { Response } from "../protocol.ts";

function parseFlag(args: string[], flag: string): string | null {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return null;
	return args[idx + 1];
}

function parseMultiFlag(args: string[], flag: string): string[] {
	const values: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === flag && i + 1 < args.length) {
			values.push(args[i + 1]);
			i++;
		}
	}
	return values;
}

function formatResults(results: CrawlResult[], jsonOutput: boolean): string {
	if (jsonOutput) {
		return JSON.stringify(results);
	}

	if (results.length === 0) {
		return "No pages crawled.";
	}

	const lines: string[] = [];
	lines.push(
		`Crawled ${results.length} page${results.length === 1 ? "" : "s"}:`,
	);
	lines.push("");

	for (const result of results) {
		lines.push(`[depth=${result.depth}] ${result.url}`);
		if (typeof result.data === "string") {
			// Truncate long text output
			const text = result.data;
			if (text.length > 200) {
				lines.push(`  ${text.slice(0, 200)}...`);
			} else {
				lines.push(`  ${text}`);
			}
		} else if (
			result.data &&
			typeof result.data === "object" &&
			"error" in (result.data as Record<string, unknown>)
		) {
			lines.push(`  ERROR: ${(result.data as Record<string, unknown>).error}`);
		} else {
			lines.push(`  ${JSON.stringify(result.data)}`);
		}
		lines.push("");
	}

	return lines.join("\n").trimEnd();
}

export async function handleCrawl(
	page: Page,
	args: string[],
	options?: { json?: boolean },
): Promise<Response> {
	const jsonOutput = options?.json ?? false;

	if (args.length === 0) {
		return {
			ok: false,
			error:
				"Usage: browse crawl <url> [--depth N] [--extract table|links|meta|text] [--paginate <selector>] [--max-pages N] [--rate-limit N/s] [--output file] [--include pattern] [--exclude pattern] [--same-origin] [--dry-run]",
		};
	}

	// Find the URL (first non-flag argument)
	let url = args[0];
	if (url.startsWith("--")) {
		return {
			ok: false,
			error:
				"First argument must be a URL. Usage: browse crawl <url> [options]",
		};
	}

	// Prepend https:// if no protocol
	if (!url.startsWith("http://") && !url.startsWith("https://")) {
		url = `https://${url}`;
	}

	// Parse options
	const depthStr = parseFlag(args, "--depth");
	const depth = depthStr ? Number.parseInt(depthStr, 10) : 1;
	if (Number.isNaN(depth) || depth < 0) {
		return {
			ok: false,
			error: "Invalid --depth value. Must be a non-negative integer.",
		};
	}

	const extract = parseFlag(args, "--extract") ?? "text";
	const validExtracts = ["table", "links", "meta", "text"];
	if (!validExtracts.includes(extract)) {
		return {
			ok: false,
			error: `Invalid --extract value: "${extract}". Use: ${validExtracts.join(", ")}`,
		};
	}

	const paginate = parseFlag(args, "--paginate") ?? undefined;

	const maxPagesStr = parseFlag(args, "--max-pages");
	const maxPages = maxPagesStr ? Number.parseInt(maxPagesStr, 10) : 100;
	if (Number.isNaN(maxPages) || maxPages < 1) {
		return {
			ok: false,
			error: "Invalid --max-pages value. Must be a positive integer.",
		};
	}

	let rateLimit: number | undefined;
	const rateLimitStr = parseFlag(args, "--rate-limit");
	if (rateLimitStr) {
		// Accept "N/s" or just "N"
		const cleaned = rateLimitStr.replace(/\/s$/i, "");
		rateLimit = Number.parseFloat(cleaned);
		if (Number.isNaN(rateLimit) || rateLimit <= 0) {
			return {
				ok: false,
				error:
					"Invalid --rate-limit value. Must be a positive number (e.g., 2/s or 5).",
			};
		}
	}

	const output = parseFlag(args, "--output") ?? undefined;
	const include = parseMultiFlag(args, "--include");
	const exclude = parseMultiFlag(args, "--exclude");
	const sameOrigin = args.includes("--same-origin");
	const dryRun = args.includes("--dry-run");

	const timeoutStr = parseFlag(args, "--timeout");
	const timeout = timeoutStr ? Number.parseInt(timeoutStr, 10) : 30000;

	const crawlOptions: CrawlOptions = {
		depth,
		extract,
		paginate,
		maxPages,
		rateLimit,
		output,
		include,
		exclude,
		sameOrigin,
		dryRun,
		timeout,
	};

	const engine = new CrawlEngine(crawlOptions);

	try {
		const results = await engine.crawl(page, url);

		// Write to file if --output specified
		if (output) {
			try {
				writeFileSync(output, JSON.stringify(results, null, 2));
			} catch (err) {
				return {
					ok: false,
					error: `Failed to write output to "${output}": ${err instanceof Error ? err.message : String(err)}`,
				};
			}
		}

		return { ok: true, data: formatResults(results, jsonOutput) };
	} catch (err) {
		return {
			ok: false,
			error: `Crawl failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
