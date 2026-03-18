import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleForward(page: Page): Promise<Response> {
	try {
		const client = await page.context().newCDPSession(page);
		let currentIndex: number;
		let entries: unknown[];
		try {
			({ currentIndex, entries } = await client.send(
				"Page.getNavigationHistory",
			));
		} finally {
			await client.detach();
		}

		if (currentIndex >= entries.length - 1) {
			return { ok: false, error: "No next page in history" };
		}

		await page.goForward({ waitUntil: "domcontentloaded" });
		const title = await page.title();
		return { ok: true, data: title };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
