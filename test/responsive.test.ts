import { describe, expect, mock, test } from "bun:test";
import {
	formatResponsiveResults,
	handleResponsive,
	parseBreakpoints,
} from "../src/commands/responsive.ts";

describe("parseBreakpoints", () => {
	test("parses custom breakpoints", () => {
		const result = parseBreakpoints([
			"--breakpoints",
			"320x568,768x1024,1920x1080",
		]);
		expect(result).toEqual([
			{ name: "320x568", width: 320, height: 568 },
			{ name: "768x1024", width: 768, height: 1024 },
			{ name: "1920x1080", width: 1920, height: 1080 },
		]);
	});

	test("returns null when no --breakpoints flag", () => {
		expect(parseBreakpoints([])).toBeNull();
		expect(parseBreakpoints(["--json"])).toBeNull();
	});

	test("returns null for invalid breakpoints", () => {
		expect(parseBreakpoints(["--breakpoints", "invalid"])).toBeNull();
	});
});

describe("formatResponsiveResults", () => {
	test("formats results with breakpoint info", () => {
		const results = [
			{ name: "mobile", width: 375, height: 667, path: "/tmp/mobile.png" },
			{ name: "desktop", width: 1440, height: 900, path: "/tmp/desktop.png" },
		];
		const output = formatResponsiveResults(results);
		expect(output).toContain("2 breakpoints captured");
		expect(output).toContain("mobile");
		expect(output).toContain("375x667");
		expect(output).toContain("desktop");
		expect(output).toContain("1440x900");
	});
});

describe("handleResponsive", () => {
	test("captures screenshots at default breakpoints", async () => {
		const viewportChanges: { width: number; height: number }[] = [];
		const page = {
			viewportSize: mock(() => ({ width: 1440, height: 900 })),
			setViewportSize: mock((size: { width: number; height: number }) => {
				viewportChanges.push(size);
				return Promise.resolve();
			}),
			reload: mock(() => Promise.resolve()),
			screenshot: mock(() => Promise.resolve()),
		} as never;

		const result = await handleResponsive(page, [
			"--out",
			"/tmp/test-responsive",
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("4 breakpoints captured");
			expect(result.data).toContain("mobile");
			expect(result.data).toContain("tablet");
			expect(result.data).toContain("desktop");
			expect(result.data).toContain("wide");
		}
		// 4 breakpoints + restore = 5 viewport changes
		expect(viewportChanges).toHaveLength(5);
	});

	test("uses custom breakpoints", async () => {
		const page = {
			viewportSize: mock(() => ({ width: 1440, height: 900 })),
			setViewportSize: mock(() => Promise.resolve()),
			reload: mock(() => Promise.resolve()),
			screenshot: mock(() => Promise.resolve()),
		} as never;

		const result = await handleResponsive(page, [
			"--breakpoints",
			"320x568,1920x1080",
			"--out",
			"/tmp/test-responsive",
		]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("2 breakpoints captured");
		}
	});

	test("navigates to URL when --url provided", async () => {
		const gotoUrls: string[] = [];
		const page = {
			viewportSize: mock(() => ({ width: 1440, height: 900 })),
			setViewportSize: mock(() => Promise.resolve()),
			goto: mock((url: string) => {
				gotoUrls.push(url);
				return Promise.resolve();
			}),
			reload: mock(() => Promise.resolve()),
			screenshot: mock(() => Promise.resolve()),
		} as never;

		await handleResponsive(page, [
			"--url",
			"https://example.com",
			"--breakpoints",
			"375x667",
			"--out",
			"/tmp/test-responsive",
		]);

		expect(gotoUrls).toHaveLength(1);
		expect(gotoUrls[0]).toBe("https://example.com");
	});

	test("returns JSON when requested", async () => {
		const page = {
			viewportSize: mock(() => ({ width: 1440, height: 900 })),
			setViewportSize: mock(() => Promise.resolve()),
			reload: mock(() => Promise.resolve()),
			screenshot: mock(() => Promise.resolve()),
		} as never;

		const result = await handleResponsive(
			page,
			["--breakpoints", "375x667", "--out", "/tmp/test-responsive"],
			{ json: true },
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			const parsed = JSON.parse(result.data);
			expect(parsed.breakpoints).toHaveLength(1);
			expect(parsed.breakpoints[0].width).toBe(375);
		}
	});

	test("handles errors and restores viewport", async () => {
		let viewportRestored = false;
		const page = {
			viewportSize: mock(() => ({ width: 1440, height: 900 })),
			setViewportSize: mock((size: { width: number; height: number }) => {
				if (size.width === 1440) viewportRestored = true;
				if (size.width === 375)
					return Promise.reject(new Error("Viewport error"));
				return Promise.resolve();
			}),
			reload: mock(() => Promise.resolve()),
			screenshot: mock(() => Promise.resolve()),
		} as never;

		const result = await handleResponsive(page, [
			"--breakpoints",
			"375x667",
			"--out",
			"/tmp/test-responsive",
		]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Viewport error");
		}
		expect(viewportRestored).toBe(true);
	});
});
