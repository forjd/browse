import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handlePress(
	page: Page,
	args: string[],
): Promise<Response> {
	if (args.length === 0) {
		return {
			ok: false,
			error:
				"Usage: browse press <key> [key ...] — e.g. Tab, Escape, Shift+Tab, Control+a",
		};
	}

	try {
		for (const key of args) {
			await page.keyboard.press(key);
		}

		const label = args.length === 1 ? args[0] : args.join(", ");
		return { ok: true, data: `Pressed ${label}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
