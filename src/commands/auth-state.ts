import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { BrowserContext, Page } from "playwright";
import type { Response } from "../protocol.ts";

const VALID_SUBCOMMANDS = ["save", "load"] as const;

function countLocalStorage(origins: { localStorage: unknown[] }[]): number {
	let count = 0;
	for (const origin of origins) {
		count += origin.localStorage.length;
	}
	return count;
}

export async function handleAuthState(
	context: BrowserContext,
	page: Page,
	args: string[],
): Promise<Response> {
	const subcommand = args[0];

	if (
		!subcommand ||
		!VALID_SUBCOMMANDS.includes(
			subcommand as (typeof VALID_SUBCOMMANDS)[number],
		)
	) {
		return {
			ok: false,
			error: `Usage: browse auth-state <save|load> <path>. Valid subcommands: ${VALID_SUBCOMMANDS.join(", ")}.`,
		};
	}

	if (subcommand === "save") {
		return handleSave(context, args);
	}

	return handleLoad(context, page, args);
}

async function handleSave(
	context: BrowserContext,
	args: string[],
): Promise<Response> {
	const path = args[1];
	if (!path) {
		return {
			ok: false,
			error: "Missing path. Usage: browse auth-state save <path>",
		};
	}

	try {
		mkdirSync(dirname(path), { recursive: true });

		const state = await context.storageState();
		await Bun.write(path, JSON.stringify(state, null, 2));

		const cookieCount = state.cookies.length;
		const lsCount = countLocalStorage(state.origins);

		return {
			ok: true,
			data: `Auth state saved to ${path} (${cookieCount} cookie${cookieCount !== 1 ? "s" : ""}, ${lsCount} localStorage entr${lsCount !== 1 ? "ies" : "y"}).`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}

async function handleLoad(
	context: BrowserContext,
	page: Page,
	args: string[],
): Promise<Response> {
	const path = args[1];
	if (!path) {
		return {
			ok: false,
			error: "Missing path. Usage: browse auth-state load <path>",
		};
	}

	if (!existsSync(path)) {
		return { ok: false, error: `File not found: ${path}` };
	}

	let state: {
		cookies: { name: string; value: string; domain: string; path: string }[];
		origins: {
			origin: string;
			localStorage: { name: string; value: string }[];
		}[];
	};
	try {
		const raw = await Bun.file(path).text();
		state = JSON.parse(raw);
	} catch {
		return {
			ok: false,
			error: `Invalid auth state file: ${path} (malformed JSON)`,
		};
	}

	try {
		// Apply cookies
		if (state.cookies?.length) {
			await context.addCookies(state.cookies);
		}

		// Apply localStorage per origin
		if (state.origins?.length) {
			for (const origin of state.origins) {
				if (origin.localStorage?.length) {
					await page.goto(origin.origin, {
						waitUntil: "domcontentloaded",
						timeout: 10_000,
					});
					await page.evaluate((items: { name: string; value: string }[]) => {
						for (const item of items) {
							localStorage.setItem(item.name, item.value);
						}
					}, origin.localStorage);
				}
			}
		}

		// Reload to apply session
		await page.reload({ waitUntil: "domcontentloaded", timeout: 10_000 });

		const cookieCount = state.cookies?.length ?? 0;
		const lsCount = countLocalStorage(state.origins ?? []);

		return {
			ok: true,
			data: `Auth state loaded from ${path} (${cookieCount} cookie${cookieCount !== 1 ? "s" : ""}, ${lsCount} localStorage entr${lsCount !== 1 ? "ies" : "y"}). Page reloaded.`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
