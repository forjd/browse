import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleGoto(
	page: Page,
	args: string[],
): Promise<Response> {
	const url = args[0];
	if (!url) {
		return { ok: false, error: "Usage: browse goto <url>" };
	}

	try {
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
		const title = await page.title();
		return { ok: true, data: title };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
