import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { handleSnapshot } from "./snapshot.ts";

export async function handlePress(
	page: Page,
	args: string[],
	options?: { autoSnapshot?: boolean },
): Promise<Response> {
	const keys = args.filter((a) => !a.startsWith("--"));

	if (keys.length === 0) {
		return {
			ok: false,
			error:
				"Usage: browse press <key> [key ...] — e.g. Tab, Escape, Shift+Tab, Control+a",
		};
	}

	try {
		const urlBefore = page.url();

		for (const key of keys) {
			await page.keyboard.press(key);
		}

		const label = keys.length === 1 ? keys[0] : keys.join(", ");
		let result = `Pressed ${label}`;

		// Detect if the key press triggered navigation (e.g. Enter on a form).
		// waitForURL is set up after the action but checks the current URL first,
		// catching both completed and in-progress navigations.
		const didNavigate = await page
			.waitForURL((url) => url.href !== urlBefore, { timeout: 1_000 })
			.then(() => true)
			.catch(() => false);

		if (didNavigate) {
			result += `\nNavigated to: ${page.url()}`;

			if (options?.autoSnapshot) {
				const snapshotResult = await handleSnapshot(page, []);
				if (snapshotResult.ok) {
					return { ok: true, data: `${result}\n\n${snapshotResult.data}` };
				}
			}
		}

		return { ok: true, data: result };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
