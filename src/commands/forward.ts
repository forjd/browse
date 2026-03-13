import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleForward(page: Page): Promise<Response> {
	try {
		const response = await page.goForward({ waitUntil: "domcontentloaded" });
		if (response === null) {
			return { ok: false, error: "No next page in history" };
		}
		const title = await page.title();
		return { ok: true, data: title };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
