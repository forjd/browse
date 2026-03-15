import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handlePdf(page: Page, args: string[]): Promise<Response> {
	try {
		const outputPath =
			args[0] ||
			join(homedir(), ".bun-browse", "exports", `page-${Date.now()}.pdf`);

		// Ensure directory exists
		const dir = dirname(outputPath);
		if (dir) {
			mkdirSync(dir, { recursive: true });
		}

		await page.pdf({ path: outputPath });

		return { ok: true, data: `PDF saved to ${outputPath}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
