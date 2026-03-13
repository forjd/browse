import { describe, expect, mock, test } from "bun:test";
import { handleViewport } from "../src/commands/viewport.ts";

function mockPage(
	viewport: { width: number; height: number } | null = {
		width: 1440,
		height: 900,
	},
) {
	return {
		viewportSize: mock(() => viewport),
		setViewportSize: mock(() => Promise.resolve()),
	} as never;
}

describe("viewport command", () => {
	describe("show current viewport", () => {
		test("returns current dimensions when no args", async () => {
			const page = mockPage({ width: 1440, height: 900 });
			const res = await handleViewport(page, []);

			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.data).toBe("1440x900");
			}
		});

		test("returns error when viewport is null", async () => {
			const page = mockPage(null);
			const res = await handleViewport(page, []);

			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("No viewport");
			}
		});
	});

	describe("set viewport with two positional args", () => {
		test("sets width and height", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["320", "568"]);

			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.data).toBe("Viewport set to 320x568");
			}
			expect(page.setViewportSize).toHaveBeenCalledWith({
				width: 320,
				height: 568,
			});
		});
	});

	describe("set viewport with WxH format", () => {
		test("parses WxH string", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["320x568"]);

			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.data).toBe("Viewport set to 320x568");
			}
			expect(page.setViewportSize).toHaveBeenCalledWith({
				width: 320,
				height: 568,
			});
		});

		test("parses WXH string (uppercase X)", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["768X1024"]);

			expect(res.ok).toBe(true);
			expect(page.setViewportSize).toHaveBeenCalledWith({
				width: 768,
				height: 1024,
			});
		});
	});

	describe("--device flag", () => {
		test("sets viewport from Playwright device descriptor", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["--device", "iPhone SE"]);

			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.data).toBe("Viewport set to 320x568 (iPhone SE)");
			}
			expect(page.setViewportSize).toHaveBeenCalledWith({
				width: 320,
				height: 568,
			});
		});

		test("returns error for unknown device", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["--device", "Nokia 3310"]);

			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("Unknown device");
			}
		});

		test("returns error when --device has no value", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["--device"]);

			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("Missing value for --device");
			}
		});
	});

	describe("--preset flag", () => {
		test("mobile preset sets 375x667", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["--preset", "mobile"]);

			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.data).toBe("Viewport set to 375x667 (mobile)");
			}
			expect(page.setViewportSize).toHaveBeenCalledWith({
				width: 375,
				height: 667,
			});
		});

		test("tablet preset sets 768x1024", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["--preset", "tablet"]);

			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.data).toBe("Viewport set to 768x1024 (tablet)");
			}
			expect(page.setViewportSize).toHaveBeenCalledWith({
				width: 768,
				height: 1024,
			});
		});

		test("desktop preset sets 1440x900", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["--preset", "desktop"]);

			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.data).toBe("Viewport set to 1440x900 (desktop)");
			}
			expect(page.setViewportSize).toHaveBeenCalledWith({
				width: 1440,
				height: 900,
			});
		});

		test("returns error for unknown preset", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["--preset", "watch"]);

			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("Unknown preset");
				expect(res.error).toContain("mobile");
				expect(res.error).toContain("tablet");
				expect(res.error).toContain("desktop");
			}
		});

		test("returns error when --preset has no value", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["--preset"]);

			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("Missing value for --preset");
			}
		});
	});

	describe("validation errors", () => {
		test("rejects non-numeric width", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["abc", "568"]);

			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("must be positive integers");
			}
		});

		test("rejects zero width", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["0", "568"]);

			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("must be positive integers");
			}
		});

		test("rejects negative height", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["320", "-1"]);

			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("must be positive integers");
			}
		});

		test("rejects width only without height", async () => {
			const page = mockPage();
			const res = await handleViewport(page, ["320"]);

			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("height");
			}
		});

		test("--device and --preset are mutually exclusive", async () => {
			const page = mockPage();
			const res = await handleViewport(page, [
				"--device",
				"iPhone SE",
				"--preset",
				"mobile",
			]);

			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("mutually exclusive");
			}
		});
	});
});
