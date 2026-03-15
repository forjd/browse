import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleDownload(
	page: Page,
	args: string[],
	resolvedTimeout?: number,
): Promise<Response> {
	const subcommand = args[0];

	if (subcommand !== "wait") {
		return {
			ok: false,
			error: "Usage: browse download wait [--save-to <path>]",
		};
	}

	let saveTo: string | undefined;
	const timeoutMs = resolvedTimeout ?? 30_000;

	for (let i = 1; i < args.length; i++) {
		if (args[i] === "--save-to" && args[i + 1]) {
			saveTo = args[i + 1];
			i++;
		}
	}

	try {
		const download = await page.waitForEvent("download", {
			timeout: timeoutMs,
		});

		const suggestedFilename = download.suggestedFilename();

		if (saveTo) {
			await download.saveAs(saveTo);
			return {
				ok: true,
				data: `Downloaded "${suggestedFilename}" to ${saveTo}`,
			};
		}

		const path = await download.path();
		return {
			ok: true,
			data: `Downloaded "${suggestedFilename}" to ${path ?? "(browser default)"}`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `Download failed: ${message}` };
	}
}
