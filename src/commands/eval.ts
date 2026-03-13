import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

function formatResult(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

export async function handleEval(
	page: Page,
	args: string[],
): Promise<Response> {
	const expression = args.join(" ").trim();

	if (!expression) {
		return {
			ok: false,
			error: "Missing expression. Usage: browse eval <expression>",
		};
	}

	try {
		const result = await page.evaluate(expression);
		return { ok: true, data: formatResult(result) };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
