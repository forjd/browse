import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

function formatResult(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

export async function handlePageEval(
	page: Page,
	args: string[],
): Promise<Response> {
	const expression = args.join(" ").trim();

	if (!expression) {
		return {
			ok: false,
			error: "Missing expression. Usage: browse page-eval <expression>",
		};
	}

	// Only fall back to the unwrapped form when *construction* fails
	// (statements that can't be parenthesized). Falling back on runtime
	// errors would re-execute side-effectful code a second time.
	let fn: (page: Page) => Promise<unknown>;
	try {
		fn = new AsyncFunction("page", `return (${expression});`);
	} catch {
		try {
			fn = new AsyncFunction("page", expression);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { ok: false, error: message };
		}
	}

	try {
		const result = await fn(page);
		return { ok: true, data: formatResult(result) };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
