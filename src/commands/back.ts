import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleBack(page: Page): Promise<Response> {
	try {
		const client = await page.context().newCDPSession(page);
		let currentIndex: number;
		try {
			({ currentIndex } = await client.send("Page.getNavigationHistory"));
		} finally {
			await client.detach();
		}

		if (currentIndex <= 0) {
			return { ok: false, error: "No previous page in history" };
		}

		await page.goBack({ waitUntil: "domcontentloaded" });
		const title = await page.title();
		return { ok: true, data: title };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
