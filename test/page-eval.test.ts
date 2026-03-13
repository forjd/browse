import { describe, expect, mock, test } from "bun:test";
import { handlePageEval } from "../src/commands/page-eval.ts";

function mockPage() {
	return {
		setViewportSize: mock(() => Promise.resolve()),
		viewportSize: mock(() => ({ width: 320, height: 568 })),
		title: mock(() => Promise.resolve("Test Page")),
		url: mock(() => "https://example.com"),
		goto: mock(() => Promise.resolve(null)),
		evaluate: mock(() => Promise.resolve("eval result")),
	} as never;
}

describe("page-eval command", () => {
	test("executes expression with access to page object", async () => {
		const page = mockPage();
		const res = await handlePageEval(page, ["await page.title()"]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("Test Page");
		}
		expect(page.title).toHaveBeenCalled();
	});

	test("returns non-string results formatted", async () => {
		const page = mockPage();
		const res = await handlePageEval(page, ["page.viewportSize()"]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(JSON.parse(res.data)).toEqual({ width: 320, height: 568 });
		}
	});

	test("returns string result for page.url()", async () => {
		const page = mockPage();
		const res = await handlePageEval(page, ["page.url()"]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("https://example.com");
		}
	});

	test("joins multiple args into single expression", async () => {
		const page = mockPage();
		const res = await handlePageEval(page, ["await", "page.title()"]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("Test Page");
		}
	});

	test("returns error when no expression provided", async () => {
		const page = mockPage();
		const res = await handlePageEval(page, []);

		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("expression");
		}
	});

	test("returns error when expression throws", async () => {
		const page = mockPage();
		const res = await handlePageEval(page, ["throw new Error('test error')"]);

		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("test error");
		}
	});

	test("returns undefined as string", async () => {
		const page = mockPage();
		const res = await handlePageEval(page, ["undefined"]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("undefined");
		}
	});
});
