import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { resolveRef } from "../refs.ts";

export async function handleAttr(
	page: Page,
	args: string[],
): Promise<Response> {
	const ref = args[0];
	if (!ref || !ref.startsWith("@")) {
		return {
			ok: false,
			error: "Usage: browse attr <@ref> [attribute] — ref must start with @",
		};
	}

	const attrName = args[1];

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

		if (attrName) {
			// Single attribute lookup
			const value = await locator.getAttribute(attrName, {
				timeout: 10_000,
			});
			if (value === null) {
				return {
					ok: true,
					data: `${ref} has no attribute "${attrName}"`,
				};
			}
			return { ok: true, data: value };
		}

		// All attributes
		const attrs = await locator.evaluate((el) => {
			const result: Record<string, string> = {};
			for (const attr of el.attributes) {
				result[attr.name] = attr.value;
			}
			return result;
		});

		const entries = Object.entries(attrs);
		if (entries.length === 0) {
			return { ok: true, data: `${ref} has no attributes` };
		}

		return {
			ok: true,
			data: entries.map(([k, v]) => `${k}=${v}`).join("\n"),
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
