import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { resolveRef } from "../refs.ts";

const SELECTABLE_ROLES = new Set(["combobox", "listbox"]);

export async function handleSelect(
	page: Page,
	args: string[],
): Promise<Response> {
	const ref = args[0];
	if (!ref || !ref.startsWith("@")) {
		return {
			ok: false,
			error: "Usage: browse select <@ref> <option>",
		};
	}

	const optionText = args.slice(1).join(" ");
	if (!optionText) {
		return {
			ok: false,
			error: "Usage: browse select <@ref> <option>",
		};
	}

	const resolved = resolveRef(ref);
	if ("error" in resolved) {
		return { ok: false, error: resolved.error };
	}

	if (!SELECTABLE_ROLES.has(resolved.role)) {
		return {
			ok: false,
			error: `${ref} is a [${resolved.role}], not a selectable element.`,
		};
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

		try {
			await locator.selectOption({ label: optionText }, { timeout: 10_000 });
		} catch (nativeErr) {
			const msg =
				nativeErr instanceof Error ? nativeErr.message : String(nativeErr);
			if (!msg.includes("not a <select> element")) {
				throw nativeErr;
			}
			// Custom ARIA combobox — focus, press ArrowDown to open, then click the option
			await locator.focus({ timeout: 10_000 });
			await page.keyboard.press("ArrowDown");
			const option = page.getByRole("option", {
				name: optionText,
				exact: true,
			});
			await option.click({ timeout: 10_000 });
		}

		return {
			ok: true,
			data: `Selected "${optionText}" in ${ref} [${resolved.role}] "${resolved.name}"`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
