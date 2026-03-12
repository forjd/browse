import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { resolveRef } from "../refs.ts";

const FILLABLE_ROLES = new Set([
	"textbox",
	"searchbox",
	"spinbutton",
	"combobox",
]);

export async function handleFill(
	page: Page,
	args: string[],
): Promise<Response> {
	const ref = args[0];
	if (!ref || !ref.startsWith("@")) {
		return {
			ok: false,
			error: "Usage: browse fill <@ref> <value>",
		};
	}

	const value = args.slice(1).join(" ");
	if (!value) {
		return {
			ok: false,
			error: "Usage: browse fill <@ref> <value>",
		};
	}

	const resolved = resolveRef(ref);
	if ("error" in resolved) {
		return { ok: false, error: resolved.error };
	}

	if (!FILLABLE_ROLES.has(resolved.role)) {
		return {
			ok: false,
			error: `${ref} is a [${resolved.role}], not a fillable element.`,
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

		await locator.fill(value, { timeout: 10_000 });

		return {
			ok: true,
			data: `Filled ${ref} [${resolved.role}] "${resolved.name}" with "${value}"`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
