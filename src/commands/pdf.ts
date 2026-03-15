import { homedir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handlePdf(page: Page, args: string[]): Promise<Response> {
	try {
		const outputPath =
			args[0] ||
			join(homedir(), ".bun-browse", "exports", `page-${Date.now()}.pdf`);

		// Ensure directory exists
		const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
		if (dir) {
			const { mkdirSync } = await import("node:fs");
			mkdirSync(dir, { recursive: true });
		}

		await page.pdf({ path: outputPath });

		return { ok: true, data: `PDF saved to ${outputPath}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
