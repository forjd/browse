import type { Page } from "playwright";

/**
 * Simple glob-to-regex matching for --include/--exclude patterns.
 */
export function matchGlob(pattern: string, url: string): boolean {
	const regex = new RegExp(
		`^${pattern.replace(/\*/g, ".*").replace(/\?/g, ".")}$`,
	);
	return regex.test(url);
}

/**
 * Normalize a URL: lowercase protocol+host, strip fragment, strip trailing slash.
 */
export function normalizeUrl(raw: string): string {
	try {
		const u = new URL(raw);
		u.hash = "";
		let href = u.href;
		if (href.endsWith("/") && u.pathname !== "/") {
			href = href.slice(0, -1);
		}
		// Lowercase protocol+host (URL constructor already lowercases host)
		return href;
	} catch {
		return raw;
	}
}

export type CrawlResult = {
	url: string;
	depth: number;
	timestamp: string;
	data: unknown;
};

export type CrawlOptions = {
	depth: number;
	extract: string;
	paginate?: string;
	maxPages: number;
	rateLimit?: number;
	output?: string;
	include?: string[];
	exclude?: string[];
	sameOrigin: boolean;
	dryRun: boolean;
	timeout: number;
};

/**
 * BFS URL frontier with dedup, depth tracking, and include/exclude filtering.
 */
export class URLFrontier {
	private queue: Array<{ url: string; depth: number }> = [];
	private seen: Set<string> = new Set();
	private maxDepth: number;
	private includePatterns: string[];
	private excludePatterns: string[];

	constructor(
		maxDepth: number,
		include: string[] = [],
		exclude: string[] = [],
	) {
		this.maxDepth = maxDepth;
		this.includePatterns = include;
		this.excludePatterns = exclude;
	}

	/**
	 * Add a URL to the frontier if not already seen and passes filters.
	 * Returns true if added.
	 */
	add(url: string, depth: number): boolean {
		const normalized = normalizeUrl(url);

		if (this.seen.has(normalized)) return false;
		if (depth > this.maxDepth) return false;

		// Include filter: if set, URL must match at least one pattern
		if (this.includePatterns.length > 0) {
			const matches = this.includePatterns.some((p) =>
				matchGlob(p, normalized),
			);
			if (!matches) return false;
		}

		// Exclude filter: URL must not match any pattern
		if (this.excludePatterns.length > 0) {
			const excluded = this.excludePatterns.some((p) =>
				matchGlob(p, normalized),
			);
			if (excluded) return false;
		}

		this.seen.add(normalized);
		this.queue.push({ url: normalized, depth });
		return true;
	}

	/**
	 * Dequeue the next URL to visit.
	 */
	next(): { url: string; depth: number } | undefined {
		return this.queue.shift();
	}

	/**
	 * Check if the frontier has more URLs.
	 */
	hasNext(): boolean {
		return this.queue.length > 0;
	}

	/**
	 * Get all URLs that have been seen (for dry-run output).
	 */
	allSeen(): string[] {
		return Array.from(this.seen);
	}

	/**
	 * Number of URLs seen so far.
	 */
	size(): number {
		return this.seen.size;
	}
}

/**
 * Token-bucket rate limiter that enforces a max requests-per-second.
 */
export class RateLimiter {
	private minIntervalMs: number;
	private lastRequestTime: number = 0;

	constructor(requestsPerSecond: number) {
		this.minIntervalMs = requestsPerSecond > 0 ? 1000 / requestsPerSecond : 0;
	}

	/**
	 * Wait if needed to satisfy the rate limit.
	 */
	async wait(): Promise<void> {
		if (this.minIntervalMs <= 0) return;

		const now = Date.now();
		const elapsed = now - this.lastRequestTime;
		if (elapsed < this.minIntervalMs) {
			const sleepMs = this.minIntervalMs - elapsed;
			await new Promise((resolve) => setTimeout(resolve, sleepMs));
		}
		this.lastRequestTime = Date.now();
	}
}

/**
 * Extract data from the current page based on the extraction type.
 */
async function extractData(page: Page, extractType: string): Promise<unknown> {
	switch (extractType) {
		case "text": {
			return await page.evaluate(() => {
				return document.body?.innerText?.trim() ?? "";
			});
		}
		case "links": {
			return await page.evaluate(() => {
				const anchors = document.querySelectorAll("a[href]");
				return Array.from(anchors).map((a) => ({
					href: (a as HTMLAnchorElement).href,
					text:
						(a as HTMLElement).innerText?.trim() ?? a.textContent?.trim() ?? "",
				}));
			});
		}
		case "table": {
			return await page.evaluate(() => {
				const tables = document.querySelectorAll("table");
				return Array.from(tables).map((table) => {
					const headers: string[] = [];
					const rows: string[][] = [];

					const ths = table.querySelectorAll(
						"thead th, thead td, tr:first-child th",
					);
					for (const th of ths) {
						headers.push(
							(th as HTMLElement).innerText?.trim() ??
								th.textContent?.trim() ??
								"",
						);
					}

					const hasTbody = table.querySelector("tbody");
					const allRows = hasTbody
						? table.querySelectorAll("tbody tr")
						: table.querySelectorAll("tr");
					let bodyRows = Array.from(allRows).filter(
						(tr) => !tr.closest("thead"),
					);
					if (
						headers.length > 0 &&
						bodyRows.length > 0 &&
						bodyRows[0].querySelectorAll("th").length > 0 &&
						bodyRows[0].querySelectorAll("td").length === 0
					) {
						bodyRows = bodyRows.slice(1);
					}

					for (const tr of bodyRows) {
						const cells = tr.querySelectorAll("td, th");
						const row: string[] = [];
						for (const cell of cells) {
							row.push(
								(cell as HTMLElement).innerText?.trim() ??
									cell.textContent?.trim() ??
									"",
							);
						}
						if (row.length > 0) rows.push(row);
					}

					if (headers.length === 0 && rows.length > 0) {
						for (let i = 0; i < rows[0].length; i++) {
							headers.push(`col${i + 1}`);
						}
					}

					return { headers, rows };
				});
			});
		}
		case "meta": {
			return await page.evaluate(() => {
				const result: Record<string, unknown> = {};
				const standard: Record<string, string> = {};
				const metaTags = document.querySelectorAll(
					"meta[name], meta[property]",
				);
				for (const tag of metaTags) {
					const name =
						tag.getAttribute("name") || tag.getAttribute("property") || "";
					const content = tag.getAttribute("content") || "";
					if (name) standard[name] = content;
				}
				result.meta = standard;
				result.title = document.title;

				const canonical = document.querySelector('link[rel="canonical"]');
				if (canonical) {
					result.canonical = canonical.getAttribute("href");
				}

				return result;
			});
		}
		default:
			return await page.evaluate(() => {
				return document.body?.innerText?.trim() ?? "";
			});
	}
}

/**
 * Discover links on the current page, optionally filtering by same-origin.
 */
async function discoverLinks(
	page: Page,
	sameOrigin: boolean,
	originUrl: string,
): Promise<string[]> {
	const links = await page.evaluate(() => {
		const anchors = document.querySelectorAll("a[href]");
		return Array.from(anchors)
			.map((a) => (a as HTMLAnchorElement).href)
			.filter((href) => href.startsWith("http"));
	});

	if (sameOrigin) {
		try {
			const origin = new URL(originUrl).origin;
			return links.filter((link) => {
				try {
					return new URL(link).origin === origin;
				} catch {
					return false;
				}
			});
		} catch {
			return links;
		}
	}

	return links;
}

/**
 * Main crawl engine that orchestrates BFS crawling with rate limiting,
 * pagination support, and configurable data extraction.
 */
export class CrawlEngine {
	private options: CrawlOptions;

	constructor(options: CrawlOptions) {
		this.options = options;
	}

	async crawl(page: Page, startUrl: string): Promise<CrawlResult[]> {
		const results: CrawlResult[] = [];
		const frontier = new URLFrontier(
			this.options.depth,
			this.options.include,
			this.options.exclude,
		);
		const rateLimiter = this.options.rateLimit
			? new RateLimiter(this.options.rateLimit)
			: null;

		frontier.add(startUrl, 0);

		// Dry-run mode: discover URLs without visiting
		if (this.options.dryRun) {
			return this.dryRunCrawl(page, startUrl, frontier);
		}

		let pagesVisited = 0;

		while (frontier.hasNext() && pagesVisited < this.options.maxPages) {
			const entry = frontier.next();
			if (!entry) break;

			if (rateLimiter) {
				await rateLimiter.wait();
			}

			try {
				await page.goto(entry.url, {
					waitUntil: "networkidle",
					timeout: this.options.timeout,
				});
			} catch (err) {
				// Log warning, continue crawling
				results.push({
					url: entry.url,
					depth: entry.depth,
					timestamp: new Date().toISOString(),
					data: {
						error: `Failed to load: ${err instanceof Error ? err.message : String(err)}`,
					},
				});
				pagesVisited++;
				continue;
			}

			const data = await extractData(page, this.options.extract);
			results.push({
				url: entry.url,
				depth: entry.depth,
				timestamp: new Date().toISOString(),
				data,
			});
			pagesVisited++;

			// Handle pagination if configured
			if (this.options.paginate) {
				const paginationResults = await this.handlePagination(
					page,
					entry.url,
					entry.depth,
				);
				results.push(...paginationResults);
				pagesVisited += paginationResults.length;
				if (pagesVisited >= this.options.maxPages) break;
			}

			// Discover links if we have remaining depth
			if (entry.depth < this.options.depth) {
				const links = await discoverLinks(
					page,
					this.options.sameOrigin,
					startUrl,
				);
				for (const link of links) {
					frontier.add(link, entry.depth + 1);
				}
			}
		}

		return results;
	}

	private async dryRunCrawl(
		page: Page,
		startUrl: string,
		frontier: URLFrontier,
	): Promise<CrawlResult[]> {
		const results: CrawlResult[] = [];
		let pagesVisited = 0;

		while (frontier.hasNext() && pagesVisited < this.options.maxPages) {
			const entry = frontier.next();
			if (!entry) break;

			results.push({
				url: entry.url,
				depth: entry.depth,
				timestamp: new Date().toISOString(),
				data: "(dry-run: not visited)",
			});
			pagesVisited++;

			// For depth > 0, we need to visit to discover links
			if (entry.depth < this.options.depth) {
				try {
					await page.goto(entry.url, {
						waitUntil: "networkidle",
						timeout: this.options.timeout,
					});
					const links = await discoverLinks(
						page,
						this.options.sameOrigin,
						startUrl,
					);
					for (const link of links) {
						frontier.add(link, entry.depth + 1);
					}
				} catch {
					// Skip link discovery on failure in dry-run
				}
			}
		}

		return results;
	}

	private async handlePagination(
		page: Page,
		baseUrl: string,
		depth: number,
	): Promise<CrawlResult[]> {
		const results: CrawlResult[] = [];
		const selector = this.options.paginate;
		if (!selector) return results;
		let pageNum = 1;
		const maxPaginationPages = this.options.maxPages;

		while (pageNum < maxPaginationPages) {
			try {
				const element = await page.$(selector);
				if (!element) break;

				const isDisabled = await element.evaluate((el) => {
					const htmlEl = el as HTMLElement;
					return (
						htmlEl.hasAttribute("disabled") ||
						htmlEl.getAttribute("aria-disabled") === "true" ||
						htmlEl.classList.contains("disabled")
					);
				});
				if (isDisabled) break;

				await element.click();
				await page.waitForLoadState("networkidle");

				const data = await extractData(page, this.options.extract);
				pageNum++;
				results.push({
					url: `${baseUrl}#page-${pageNum}`,
					depth,
					timestamp: new Date().toISOString(),
					data,
				});
			} catch {
				break;
			}
		}

		return results;
	}
}
