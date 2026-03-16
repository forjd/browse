import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { resolveRef } from "../refs.ts";

export async function handleClick(
	page: Page,
	args: string[],
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
		await locator.click(clickOpts);

		return {
			ok: true,
			data: `Clicked ${ref} [${resolved.role}] "${resolved.name}"`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
