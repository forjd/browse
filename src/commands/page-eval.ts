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

	try {
		const fn = new AsyncFunction("page", `return (${expression});`);
		const result = await fn(page);
		return { ok: true, data: formatResult(result) };
	} catch {
		// Retry without wrapping in parens — handles statements like `throw ...`
		try {
			const fn = new AsyncFunction("page", expression);
			const result = await fn(page);
			return { ok: true, data: formatResult(result) };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { ok: false, error: message };
		}
	}
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
