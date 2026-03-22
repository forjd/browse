import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleOffline(
	page: Page,
	args: string[],
): Promise<Response> {
	if (args.length === 0) {
		return { ok: false, error: "Usage: browse offline <on|off>" };
	}

	const mode = args[0];
	if (mode !== "on" && mode !== "off") {
		return { ok: false, error: "Usage: browse offline <on|off>" };
	}

	try {
		const cdp = await page.context().newCDPSession(page);
		await cdp.send("Network.emulateNetworkConditions", {
			offline: mode === "on",
			downloadThroughput: -1,
			uploadThroughput: -1,
			latency: 0,
		});
		await cdp.detach();
		return { ok: true, data: `Offline mode: ${mode}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (
			message.includes("Target does not support") ||
			message.includes("Protocol error") ||
			message.includes("newCDPSession")
		) {
			return { ok: false, error: "Offline mode requires Chromium." };
		}
		return { ok: false, error: `Failed to set offline mode: ${message}` };
	}
}
