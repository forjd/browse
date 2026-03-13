import { describe, expect, mock, test } from "bun:test";
import { handleEval } from "../src/commands/eval.ts";

function mockPage(evaluateResult: unknown = undefined) {
	return {
		evaluate: mock(() => Promise.resolve(evaluateResult)),
	} as never;
}

function mockPageEvaluateThrows(error: Error) {
	return {
		evaluate: mock(() => Promise.reject(error)),
	} as never;
}

describe("eval command", () => {
	test("returns string result for primitive expression", async () => {
		const page = mockPage("Hello World");
		const res = await handleEval(page, ["document.title"]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("Hello World");
		}
		expect(page.evaluate).toHaveBeenCalled();
	});

	test("returns number as string", async () => {
		const page = mockPage(42);
		const res = await handleEval(page, ["1 + 1"]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("42");
		}
	});

	test("returns boolean as string", async () => {
		const page = mockPage(true);
		const res = await handleEval(page, ["true"]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("true");
		}
	});

	test("returns null as string", async () => {
		const page = mockPage(null);
		const res = await handleEval(page, ["null"]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("null");
		}
	});

	test("returns undefined as string", async () => {
		const page = mockPage(undefined);
		const res = await handleEval(page, ["void 0"]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("undefined");
		}
	});

	test("JSON-stringifies object results", async () => {
		const page = mockPage({ width: 320, height: 568 });
		const res = await handleEval(page, ["window.screen"]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(JSON.parse(res.data)).toEqual({ width: 320, height: 568 });
		}
	});

	test("JSON-stringifies array results", async () => {
		const page = mockPage([1, 2, 3]);
		const res = await handleEval(page, ["[1,2,3]"]);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(JSON.parse(res.data)).toEqual([1, 2, 3]);
		}
	});

	test("joins multiple args into single expression", async () => {
		const page = mockPage("result");
		const res = await handleEval(page, ["document", ".title"]);

		expect(res.ok).toBe(true);
		expect(page.evaluate).toHaveBeenCalled();
	});

	test("returns error when no expression provided", async () => {
		const page = mockPage();
		const res = await handleEval(page, []);

		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("expression");
		}
	});

	test("returns error when page.evaluate throws", async () => {
		const page = mockPageEvaluateThrows(
			new Error("ReferenceError: foo is not defined"),
		);
		const res = await handleEval(page, ["foo"]);

		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("foo is not defined");
		}
	});
});
