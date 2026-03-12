import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { handleScreenshot } from "../src/commands/screenshot.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-screenshot");

function mockPage(overrides: Record<string, unknown> = {}) {
	return {
		screenshot: mock(() => Promise.resolve()),
		evaluate: mock(() => Promise.resolve(1000)),
		locator: mock(() => ({
			first: () => ({
				screenshot: mock(() => Promise.resolve()),
				count: mock(() => Promise.resolve(1)),
			}),
			count: mock(() => Promise.resolve(1)),
		})),
		...overrides,
	} as never;
}

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("screenshot command", () => {
	test("full-page screenshot with explicit path", async () => {
		const page = mockPage();
		const outPath = join(TEST_DIR, "test.png");
		const res = await handleScreenshot(page, [outPath]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe(outPath);
		}
		expect(page.screenshot).toHaveBeenCalledWith(
			expect.objectContaining({ path: outPath, fullPage: true }),
		);
	});

	test("full-page screenshot with auto-generated path", async () => {
		const page = mockPage();
		const res = await handleScreenshot(page, []);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toMatch(/\.png$/);
			expect(res.data).toContain("screenshot-");
		}
	});

	test("viewport-only screenshot", async () => {
		const page = mockPage();
		const outPath = join(TEST_DIR, "viewport.png");
		const res = await handleScreenshot(page, [outPath, "--viewport"]);

		expect(res.ok).toBe(true);
		expect(page.screenshot).toHaveBeenCalledWith(
			expect.objectContaining({ path: outPath, fullPage: false }),
		);
	});

	test("element screenshot with --selector", async () => {
		const elementScreenshot = mock(() => Promise.resolve());
		const page = mockPage({
			locator: mock(() => ({
				first: () => ({
					screenshot: elementScreenshot,
				}),
				count: mock(() => Promise.resolve(1)),
			})),
		});

		const outPath = join(TEST_DIR, "element.png");
		const res = await handleScreenshot(page, [
			outPath,
			"--selector",
			".app-header",
		]);

		expect(res.ok).toBe(true);
		expect(page.locator).toHaveBeenCalledWith(".app-header");
		expect(elementScreenshot).toHaveBeenCalled();
	});

	test("--selector with no matching element returns error", async () => {
		const page = mockPage({
			locator: mock(() => ({
				first: () => ({
					screenshot: mock(() =>
						Promise.reject(new Error("Element not found")),
					),
				}),
				count: mock(() => Promise.resolve(0)),
			})),
		});

		const res = await handleScreenshot(page, ["--selector", ".nonexistent"]);

		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain(".nonexistent");
		}
	});

	test("--viewport and --selector together returns error", async () => {
		const page = mockPage();
		const res = await handleScreenshot(page, [
			"--viewport",
			"--selector",
			".header",
		]);

		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("mutually exclusive");
		}
	});

	test("--selector without value returns error", async () => {
		const page = mockPage();
		const res = await handleScreenshot(page, ["--selector"]);

		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("--selector");
		}
	});

	test("creates parent directories for output path", async () => {
		const page = mockPage();
		const deepPath = join(TEST_DIR, "deep", "nested", "dir", "shot.png");
		const res = await handleScreenshot(page, [deepPath]);

		expect(res.ok).toBe(true);
		// Parent dir should have been created
		expect(existsSync(join(TEST_DIR, "deep", "nested", "dir"))).toBe(true);
	});

	test("falls back to viewport when page too tall", async () => {
		const page = mockPage({
			evaluate: mock(() => Promise.resolve(20_000)),
		});
		const outPath = join(TEST_DIR, "tall.png");
		const res = await handleScreenshot(page, [outPath]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("too tall");
		}
		expect(page.screenshot).toHaveBeenCalledWith(
			expect.objectContaining({ fullPage: false }),
		);
	});
});
