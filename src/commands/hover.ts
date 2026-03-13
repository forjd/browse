import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { resolveRef } from "../refs.ts";

export async function handleHover(
	page: Page,
	args: string[],
): Promise<Response> {
	const ref = args[0];
	if (!ref || !ref.startsWith("@")) {
		return {
			ok: false,
			error:
				"Usage: browse hover <@ref> [--duration <ms>] — ref must start with @",
		};
	}

	// Parse --duration flag
	const durationIdx = args.indexOf("--duration");
	let durationMs: number | undefined;
	if (durationIdx !== -1) {
		const raw = args[durationIdx + 1];
		const parsed = Number(raw);
		if (!raw || Number.isNaN(parsed) || parsed <= 0) {
			return {
				ok: false,
				error: `Invalid duration: expected a positive number of milliseconds, got "${raw ?? ""}"`,
			};
		}
		durationMs = parsed;
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

		await locator.hover({ timeout: 10_000 });

		if (durationMs) {
			await new Promise((resolve) => setTimeout(resolve, durationMs));
		}

		const suffix = durationMs ? ` (held ${durationMs}ms)` : "";
		return {
			ok: true,
			data: `Hovered ${ref} [${resolved.role}] "${resolved.name}"${suffix}`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
