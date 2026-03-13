import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { resolveRef } from "../refs.ts";

export async function handleUpload(
	page: Page,
	args: string[],
): Promise<Response> {
	const ref = args[0];
	if (!ref || !ref.startsWith("@")) {
		return {
			ok: false,
			error: "Usage: browse upload <@ref> <file> [file ...]",
		};
	}

	const filePaths = args.slice(1);
	if (filePaths.length === 0) {
		return {
			ok: false,
			error: "Usage: browse upload <@ref> <file> [file ...]",
		};
	}

	const resolved = resolveRef(ref);
	if ("error" in resolved) {
		return { ok: false, error: resolved.error };
	}

	// Resolve and validate all file paths
	const absolutePaths: string[] = [];
	for (const fp of filePaths) {
		const abs = resolve(fp);
		if (!existsSync(abs)) {
			return { ok: false, error: `File does not exist: ${fp}` };
		}
		absolutePaths.push(abs);
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

		await locator.setInputFiles(absolutePaths, { timeout: 10_000 });

		const count = absolutePaths.length;
		const label = count === 1 ? "1 file" : `${count} files`;
		return {
			ok: true,
			data: `Uploaded ${label} to ${ref} [${resolved.role}] "${resolved.name}"`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
