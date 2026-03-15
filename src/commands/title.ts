import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleTitle(page: Page): Promise<Response> {
	try {
		const title = await page.title();
		return { ok: true, data: title };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
