import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { resolveLocator } from "../refs.ts";

const MAX_HTML_LENGTH = 50_000;

export async function handleHtml(
	page: Page,
	args: string[],
): Promise<Response> {
	try {
		let html: string;

		if (args[0]) {
			const selector = args[0];
			const resolved = resolveLocator(page, selector);
			if ("error" in resolved) {
				return { ok: false, error: resolved.error };
			}

			html = await resolved.locator.evaluate((el) => el.outerHTML);
		} else {
			html = await page.evaluate(() => document.documentElement.outerHTML);
		}

		if (html.length > MAX_HTML_LENGTH) {
			html = `${html.slice(0, MAX_HTML_LENGTH)}\n[... truncated at ${MAX_HTML_LENGTH} chars]`;
		}

		return { ok: true, data: html };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
