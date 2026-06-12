import { describe, expect, test } from "bun:test";
import {
	isPrivateNetworkHost,
	matchGlob,
	normalizeUrl,
	RateLimiter,
	shouldCrawlDiscoveredUrl,
	URLFrontier,
} from "../src/crawl-engine.ts";

describe("normalizeUrl", () => {
	test("strips fragment", () => {
		expect(normalizeUrl("https://example.com/page#section")).toBe(
			"https://example.com/page",
		);
	});

	test("strips trailing slash from path", () => {
		expect(normalizeUrl("https://example.com/page/")).toBe(
			"https://example.com/page",
		);
	});

	test("preserves trailing slash for root path", () => {
		expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
	});

	test("lowercases protocol and host", () => {
		expect(normalizeUrl("HTTPS://EXAMPLE.COM/Page")).toBe(
			"https://example.com/Page",
		);
	});

	test("returns raw string for invalid URL", () => {
		expect(normalizeUrl("not-a-url")).toBe("not-a-url");
	});

	test("strips fragment and trailing slash together", () => {
		expect(normalizeUrl("https://example.com/page/#frag")).toBe(
			"https://example.com/page",
		);
	});

	test("keeps a trailing slash that belongs to the query string", () => {
		expect(normalizeUrl("https://example.com/search?q=foo/")).toBe(
			"https://example.com/search?q=foo/",
		);
	});
});

describe("matchGlob", () => {
	test("matches wildcard pattern", () => {
		expect(matchGlob("*example*", "https://example.com")).toBe(true);
	});

	test("matches exact URL", () => {
		expect(matchGlob("https://example.com", "https://example.com")).toBe(true);
	});

	test("does not match unrelated URL", () => {
		expect(matchGlob("*example*", "https://other.com")).toBe(false);
	});

	test("matches with question mark wildcard", () => {
		expect(
			matchGlob("https://example.com/pag?", "https://example.com/page"),
		).toBe(true);
	});

	test("matches URL path patterns", () => {
		expect(matchGlob("*/blog/*", "https://example.com/blog/post-1")).toBe(true);
	});

	test("treats regex metacharacters as literals", () => {
		expect(matchGlob("*example.com*", "https://xexamplexcom.evil")).toBe(false);
		expect(matchGlob("*price (usd)*", "https://shop.com/price (usd)")).toBe(
			true,
		);
		// Patterns with regex specials must not throw
		expect(matchGlob("*[id]*", "https://example.com/[id]/edit")).toBe(true);
		expect(matchGlob("*a+b*", "https://example.com/a+b")).toBe(true);
	});
});

describe("crawl link filtering", () => {
	test("blocks cross-origin discovered links by default", () => {
		expect(
			shouldCrawlDiscoveredUrl(
				"https://other.example/page",
				"https://example.com/start",
				{ sameOrigin: true, allowPrivateNetwork: false },
			),
		).toBe(false);
	});

	test("allows public cross-origin links when external traversal is enabled", () => {
		expect(
			shouldCrawlDiscoveredUrl(
				"https://other.example/page",
				"https://example.com/start",
				{ sameOrigin: false, allowPrivateNetwork: false },
			),
		).toBe(true);
	});

	test("blocks private-network cross-origin links without explicit opt-in", () => {
		expect(
			shouldCrawlDiscoveredUrl(
				"http://169.254.169.254/latest/meta-data",
				"https://example.com/start",
				{ sameOrigin: false, allowPrivateNetwork: false },
			),
		).toBe(false);
	});

	test("allows private-network cross-origin links with explicit opt-in", () => {
		expect(
			shouldCrawlDiscoveredUrl(
				"http://192.168.1.10/admin",
				"https://example.com/start",
				{ sameOrigin: false, allowPrivateNetwork: true },
			),
		).toBe(true);
	});

	test("allows private-network links when they are on the seed origin", () => {
		expect(
			shouldCrawlDiscoveredUrl(
				"http://localhost:3000/settings",
				"http://localhost:3000/",
				{ sameOrigin: true, allowPrivateNetwork: false },
			),
		).toBe(true);
	});

	test("identifies common private-network host forms", () => {
		expect(isPrivateNetworkHost("localhost")).toBe(true);
		expect(isPrivateNetworkHost("10.0.0.5")).toBe(true);
		expect(isPrivateNetworkHost("172.16.1.1")).toBe(true);
		expect(isPrivateNetworkHost("192.168.1.1")).toBe(true);
		expect(isPrivateNetworkHost("169.254.169.254")).toBe(true);
		expect(isPrivateNetworkHost("example.com")).toBe(false);
		expect(isPrivateNetworkHost("fd-example.com")).toBe(false);
	});
});

describe("URLFrontier", () => {
	test("deduplicates URLs", () => {
		const frontier = new URLFrontier(2);
		expect(frontier.add("https://example.com", 0)).toBe(true);
		expect(frontier.add("https://example.com", 0)).toBe(false);
		expect(frontier.size()).toBe(1);
	});

	test("normalizes URLs for dedup", () => {
		const frontier = new URLFrontier(2);
		frontier.add("https://example.com/page#section", 0);
		expect(frontier.add("https://example.com/page", 0)).toBe(false);
	});

	test("respects max depth", () => {
		const frontier = new URLFrontier(1);
		expect(frontier.add("https://example.com", 0)).toBe(true);
		expect(frontier.add("https://example.com/a", 1)).toBe(true);
		expect(frontier.add("https://example.com/b", 2)).toBe(false);
	});

	test("returns entries in FIFO order", () => {
		const frontier = new URLFrontier(2);
		frontier.add("https://a.com", 0);
		frontier.add("https://b.com", 1);
		expect(frontier.next()?.url).toBe("https://a.com/");
		expect(frontier.next()?.url).toBe("https://b.com/");
	});

	test("hasNext returns correct value", () => {
		const frontier = new URLFrontier(2);
		expect(frontier.hasNext()).toBe(false);
		frontier.add("https://example.com", 0);
		expect(frontier.hasNext()).toBe(true);
		frontier.next();
		expect(frontier.hasNext()).toBe(false);
	});

	test("include filter: only matching URLs added", () => {
		const frontier = new URLFrontier(2, ["*blog*"]);
		expect(frontier.add("https://example.com/blog/post", 0)).toBe(true);
		expect(frontier.add("https://example.com/about", 0)).toBe(false);
	});

	test("exclude filter: matching URLs rejected", () => {
		const frontier = new URLFrontier(2, [], ["*admin*"]);
		expect(frontier.add("https://example.com/page", 0)).toBe(true);
		expect(frontier.add("https://example.com/admin/settings", 0)).toBe(false);
	});

	test("include and exclude together", () => {
		const frontier = new URLFrontier(2, ["*example.com*"], ["*admin*"]);
		expect(frontier.add("https://example.com/page", 0)).toBe(true);
		expect(frontier.add("https://example.com/admin", 0)).toBe(false);
		expect(frontier.add("https://other.com/page", 0)).toBe(false);
	});

	test("allSeen returns all normalized URLs", () => {
		const frontier = new URLFrontier(2);
		frontier.add("https://a.com", 0);
		frontier.add("https://b.com", 0);
		const seen = frontier.allSeen();
		expect(seen).toHaveLength(2);
		expect(seen).toContain("https://a.com/");
		expect(seen).toContain("https://b.com/");
	});
});

describe("RateLimiter", () => {
	test("does not delay first request", async () => {
		const limiter = new RateLimiter(10);
		const start = Date.now();
		await limiter.wait();
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(50);
	});

	test("delays subsequent requests", async () => {
		const limiter = new RateLimiter(2); // 2 req/s = 500ms interval
		await limiter.wait();
		const start = Date.now();
		await limiter.wait();
		const elapsed = Date.now() - start;
		// Should wait at least ~400ms (allowing some tolerance)
		expect(elapsed).toBeGreaterThanOrEqual(400);
	});

	test("zero rate means no delay", async () => {
		const limiter = new RateLimiter(0);
		const start = Date.now();
		await limiter.wait();
		await limiter.wait();
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(50);
	});
});
