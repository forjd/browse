import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { resolveRef } from "../refs.ts";

const DIRECTIONS = new Set(["up", "down", "top", "bottom"]);

export async function handleScroll(
	page: Page,
	args: string[],
): Promise<Response> {
	const target = args[0];
	if (!target) {
		return {
			ok: false,
			error:
				"Usage: browse scroll <down|up|top|bottom|@ref|x y> — scroll the page or an element into view",
		};
	}

	try {
		// Scroll element into view by ref
		if (target.startsWith("@")) {
			return await scrollToRef(page, target);
		}

		// Named direction
		if (DIRECTIONS.has(target)) {
			return await scrollDirection(page, target);
		}

		// x,y coordinates — first arg must be a number
		const x = Number(target);
		if (!Number.isNaN(x)) {
			const yArg = args[1];
			if (!yArg) {
				return {
					ok: false,
					error:
						"Unknown scroll target: expected down, up, top, bottom, @ref, or x y coordinates",
				};
			}
			const y = Number(yArg);
			if (Number.isNaN(y)) {
				return {
					ok: false,
					error: "Scroll coordinates must be numbers: browse scroll <x> <y>",
				};
			}
			return await scrollToCoordinates(page, x, y);
		}

		return {
			ok: false,
			error:
				"Unknown scroll target: expected down, up, top, bottom, @ref, or x y coordinates",
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}

async function scrollDirection(
	page: Page,
	direction: string,
): Promise<Response> {
	const viewport = page.viewportSize();

	switch (direction) {
		case "down": {
			const delta = viewport?.height ?? 900;
			await page.evaluate((d) => window.scrollBy(0, d), delta);
			return { ok: true, data: `Scrolled down ${delta}px` };
		}
		case "up": {
			const delta = viewport?.height ?? 900;
			await page.evaluate((d) => window.scrollBy(0, -d), delta);
			return { ok: true, data: `Scrolled up ${delta}px` };
		}
		case "top":
			await page.evaluate(() => window.scrollTo(0, 0));
			return { ok: true, data: "Scrolled to top" };
		case "bottom":
			await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
			return { ok: true, data: "Scrolled to bottom" };
		default:
			return { ok: false, error: `Unknown direction: ${direction}` };
	}
}

async function scrollToRef(page: Page, ref: string): Promise<Response> {
	const resolved = resolveRef(ref);
	if ("error" in resolved) {
		return { ok: false, error: resolved.error };
	}

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

	await locator.scrollIntoViewIfNeeded({ timeout: 10_000 });

	return {
		ok: true,
		data: `Scrolled ${ref} [${resolved.role}] "${resolved.name}" into view`,
	};
}

async function scrollToCoordinates(
	page: Page,
	x: number,
	y: number,
): Promise<Response> {
	await page.evaluate(({ x, y }) => window.scrollTo(x, y), { x, y });
	return { ok: true, data: `Scrolled to (${x}, ${y})` };
}
