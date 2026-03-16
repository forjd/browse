import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { resolveRef } from "../refs.ts";
import { handleSnapshot } from "./snapshot.ts";

export async function handleClick(
	page: Page,
	args: string[],
	options?: { autoSnapshot?: boolean },
): Promise<Response> {
	const ref = args[0];
	if (!ref || !ref.startsWith("@")) {
		return {
			ok: false,
			error: "Usage: browse click <@ref> — ref must start with @",
		};
	}

	const resolved = resolveRef(ref);
	if ("error" in resolved) {
		return { ok: false, error: resolved.error };
	}

	try {
		const locator =
			resolved.totalMatches > 1
				? page
						.getByRole(resolved.role as Parameters<Page["getByRole"]>[0], {
							name: resolved.name,
							exact: true,
						})
						.nth(resolved.nthMatch)
				: page.getByRole(resolved.role as Parameters<Page["getByRole"]>[0], {
						name: resolved.name,
						exact: true,
					});

		// Combobox elements (reka-ui/Radix/shadcn) fail Playwright's actionability
		// checks despite being visible and interactive. Force bypasses those checks.
		const clickOpts: { timeout: number; force?: boolean } = { timeout: 10_000 };
		if (resolved.role === "combobox") {
			clickOpts.force = true;
		}

		// Track URL before click to detect navigation (only if auto-snapshot)
		const urlBefore = options?.autoSnapshot ? page.url() : undefined;
		await locator.click(clickOpts);

		let result = `Clicked ${ref} [${resolved.role}] "${resolved.name}"`;

		// Auto-snapshot: if the click caused navigation, re-snapshot for fresh refs
		if (options?.autoSnapshot) {
			// Brief wait for potential navigation
			await page
				.waitForLoadState("domcontentloaded", { timeout: 3_000 })
				.catch(() => {});
			const urlAfter = page.url();
			if (urlBefore && urlAfter !== urlBefore) {
				result += `\nNavigated to: ${urlAfter}`;
			}
			const snapshotResult = await handleSnapshot(page, []);
			if (snapshotResult.ok) {
				return { ok: true, data: `${result}\n\n${snapshotResult.data}` };
			}
		}

		return { ok: true, data: result };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
