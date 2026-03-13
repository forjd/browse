import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleReload(
	page: Page,
	args: string[],
): Promise<Response> {
	try {
		const hard = args.includes("--hard");
		if (hard) {
			const client = await page.context().newCDPSession(page);
			await client.send("Network.clearBrowserCache");
			await client.detach();
		}
		await page.reload({ waitUntil: "domcontentloaded" });
		const title = await page.title();
		return { ok: true, data: title };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
