import { describe, expect, mock, test } from "bun:test";
import { handleGoto } from "../src/commands/goto.ts";
import { handleQuit } from "../src/commands/quit.ts";
import { handleText } from "../src/commands/text.ts";

/** Minimal mock page object */
function mockPage(overrides: Record<string, unknown> = {}) {
	return {
		goto: mock(() => Promise.resolve()),
		title: mock(() => Promise.resolve("Example Domain")),
		innerText: mock(() => Promise.resolve("Hello World")),
		...overrides,
	};
}

describe("handleGoto", () => {
	test("navigates and returns page title", async () => {
		const page = mockPage();
		const result = await handleGoto(page as never, ["https://example.com"]);
		expect(result).toEqual({ ok: true, data: "Example Domain" });
		expect(page.goto).toHaveBeenCalledWith("https://example.com", {
			waitUntil: "domcontentloaded",
			timeout: 30_000,
		});
	});

	test("returns error when URL arg is missing", async () => {
		const page = mockPage();
		const result = await handleGoto(page as never, []);
		expect(result).toEqual({ ok: false, error: "Usage: browse goto <url>" });
		expect(page.goto).not.toHaveBeenCalled();
	});

	test("returns error when navigation fails", async () => {
		const page = mockPage({
			goto: mock(() => Promise.reject(new Error("net::ERR_NAME_NOT_RESOLVED"))),
		});
		const result = await handleGoto(page as never, ["https://bad.invalid"]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("net::ERR_NAME_NOT_RESOLVED");
		}
	});

	test("reports CDN access-denied diagnostics for 403 navigation responses", async () => {
		const page = mockPage({
			goto: mock(() =>
				Promise.resolve({
					status: () => 403,
					statusText: () => "Forbidden",
					url: () => "https://www.war.gov/UFO/",
					headers: () => ({
						server: "AkamaiGHost",
						"content-type": "text/html",
					}),
					text: () =>
						Promise.resolve(
							"<html><head><title>Access Denied</title></head><body>Reference #18.deadbeef</body></html>",
						),
				}),
			),
		});
		const result = await handleGoto(page as never, [
			"https://www.war.gov/UFO/",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("HTTP 403 Forbidden");
			expect(result.error).toContain("AkamaiGHost");
			expect(result.error).toContain("Access Denied");
			expect(result.error).toContain("CDN/bot-protection");
			expect(result.error).toContain("BROWSE_PROXY");
		}
	});

	test("reports HTTP error diagnostics for non-OK navigation responses", async () => {
		const page = mockPage({
			goto: mock(() =>
				Promise.resolve({
					status: () => 503,
					statusText: () => "Service Unavailable",
					url: () => "https://example.com/down",
					headers: () => ({ server: "nginx" }),
					text: () => Promise.resolve("temporarily unavailable"),
				}),
			),
		});
		const result = await handleGoto(page as never, [
			"https://example.com/down",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("HTTP 503 Service Unavailable");
			expect(result.error).toContain("Server: nginx");
			expect(result.error).toContain("Body: temporarily unavailable");
		}
	});
});

describe("handleText", () => {
	test("returns visible text", async () => {
		const page = mockPage();
		const result = await handleText(page as never);
		expect(result).toEqual({ ok: true, data: "Hello World" });
	});

	test("truncates text exceeding 50,000 characters", async () => {
		const longText = "x".repeat(60_000);
		const page = mockPage({
			innerText: mock(() => Promise.resolve(longText)),
		});
		const result = await handleText(page as never);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.length).toBe(50_000);
		}
	});

	test("returns error when innerText fails", async () => {
		const page = mockPage({
			innerText: mock(() => Promise.reject(new Error("Page crashed"))),
		});
		const result = await handleText(page as never);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Page crashed");
		}
	});
});

describe("handleQuit", () => {
	test("returns shutdown confirmation", async () => {
		const result = await handleQuit();
		expect(result).toEqual({ ok: true, data: "Daemon stopped." });
	});
});
