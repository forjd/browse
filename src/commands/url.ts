import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleUrl(page: Page): Promise<Response> {
	try {
		const url = page.url();
		return { ok: true, data: url };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
