import type { BrowserContext } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleCookies(
	context: BrowserContext,
	args: string[],
): Promise<Response> {
	let domain: string | undefined;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--domain" && args[i + 1]) {
			domain = args[i + 1];
			i++;
		}
	}

	try {
		const cookies = await context.cookies();
		const filtered = domain
			? cookies.filter((c) => c.domain.includes(domain))
			: cookies;

		if (filtered.length === 0) {
			return {
				ok: true,
				data: domain ? `No cookies for domain: ${domain}` : "No cookies.",
			};
		}

		const lines = filtered.map(
			(c) =>
				`${c.name}=${c.value} (domain=${c.domain}, path=${c.path}, secure=${c.secure}, httpOnly=${c.httpOnly})`,
		);

		return { ok: true, data: lines.join("\n") };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
