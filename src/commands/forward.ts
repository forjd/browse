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

		// goForward can hang when the browser uses bfcache and no navigation
		// events fire. Race against a poller that checks if the URL changed.
		const urlBefore = page.url();
		const pollForUrlChange = async () => {
			for (let i = 0; i < 50; i++) {
				await new Promise((r) => setTimeout(r, 100));
				if (page.url() !== urlBefore) {
					await new Promise((r) => setTimeout(r, 200));
					return;
				}
			}
		};
		const navigation = page.goForward({ waitUntil: "domcontentloaded" });
		// If the poller wins the race, the navigation promise may still reject
		// later (e.g. timeout) — swallow it to avoid an unhandled rejection.
		navigation.catch(() => {});
		await Promise.race([navigation, pollForUrlChange()]);
		const title = await page.title();
		return { ok: true, data: title };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
