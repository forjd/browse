import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

const MAX_TEXT_LENGTH = 50_000;

export async function handleText(page: Page): Promise<Response> {
	try {
		let text = await page.innerText("body");
		if (text.length > MAX_TEXT_LENGTH) {
			text = text.slice(0, MAX_TEXT_LENGTH);
		}
		return { ok: true, data: text };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
