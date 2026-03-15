import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleStorage(
	page: Page,
	args: string[],
): Promise<Response> {
	const subcommand = args[0];

	if (!subcommand || (subcommand !== "local" && subcommand !== "session")) {
		return {
			ok: false,
			error: "Usage: browse storage <local|session>",
		};
	}

	try {
		const storageType =
			subcommand === "local" ? "localStorage" : "sessionStorage";

		const entries = await page.evaluate((type) => {
			const storage = type === "localStorage" ? localStorage : sessionStorage;
			const result: Record<string, string> = {};
			for (let i = 0; i < storage.length; i++) {
				const key = storage.key(i);
				if (key !== null) {
					result[key] = storage.getItem(key) ?? "";
				}
			}
			return result;
		}, storageType);

		const keys = Object.keys(entries);
		if (keys.length === 0) {
			return { ok: true, data: `No ${storageType} entries.` };
		}

		const lines = keys.map((k) => {
			const val = entries[k];
			const display = val.length > 100 ? `${val.slice(0, 100)}...` : val;
			return `${k} = ${display}`;
		});

		return { ok: true, data: lines.join("\n") };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
