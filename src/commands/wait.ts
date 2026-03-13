import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { resolveLocator } from "../refs.ts";

const POLL_INTERVAL_MS = 100;

/**
 * Wait for a condition before proceeding. Useful for SPAs where client-side
 * navigation doesn't trigger full page loads.
 *
 * The daemon-level --timeout flag bounds the total wait time.
 */
export async function handleWait(
	page: Page,
	args: string[],
): Promise<Response> {
	const subcommand = args[0];

	if (!subcommand) {
		return {
			ok: false,
			error:
				"Usage: browse wait <url|text|visible|hidden|network-idle|ms>\n\nTypes:\n  url <substring>            Wait until URL contains substring\n  text <string>              Wait until page text contains string\n  visible <selector|@ref>    Wait until element is visible\n  hidden <selector|@ref>     Wait until element disappears\n  network-idle               Wait until no pending network requests\n  <ms>                       Wait for a fixed delay in milliseconds",
		};
	}

	try {
		switch (subcommand) {
			case "url":
				return await waitUrl(page, args.slice(1));
			case "text":
				return await waitText(page, args.slice(1));
			case "visible":
				return await waitVisible(page, args.slice(1));
			case "hidden":
				return await waitHidden(page, args.slice(1));
			case "network-idle":
				return await waitNetworkIdle(page);
			default: {
				// Try as numeric delay
				const ms = Number(subcommand);
				if (!Number.isNaN(ms) && ms > 0) {
					return await waitDelay(ms);
				}
				return {
					ok: false,
					error: `Unknown wait type: '${subcommand}'. Valid types: url, text, visible, hidden, network-idle, <ms>`,
				};
			}
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}

async function waitUrl(page: Page, args: string[]): Promise<Response> {
	const substring = args[0];
	if (!substring) {
		return {
			ok: false,
			error: "Usage: browse wait url <substring>",
		};
	}

	while (!page.url().includes(substring)) {
		await sleep(POLL_INTERVAL_MS);
	}

	return { ok: true, data: `URL contains "${substring}"` };
}

async function waitText(page: Page, args: string[]): Promise<Response> {
	const text = args[0];
	if (!text) {
		return {
			ok: false,
			error: "Usage: browse wait text <string>",
		};
	}

	while (true) {
		try {
			const bodyText = await page.innerText("body");
			if (bodyText.includes(text)) {
				return { ok: true, data: `Page contains "${text}"` };
			}
		} catch {
			// Page may not be ready yet
		}
		await sleep(POLL_INTERVAL_MS);
	}
}

async function waitVisible(page: Page, args: string[]): Promise<Response> {
	const target = args[0];
	if (!target) {
		return {
			ok: false,
			error: "Usage: browse wait visible <selector|@ref>",
		};
	}

	const resolved = resolveLocator(page, target);
	if ("error" in resolved) {
		return { ok: false, error: resolved.error };
	}

	while (true) {
		try {
			const visible = await resolved.locator.first().isVisible();
			if (visible) {
				return { ok: true, data: `Element "${target}" is visible` };
			}
		} catch {
			// Element not found yet
		}
		await sleep(POLL_INTERVAL_MS);
	}
}

async function waitHidden(page: Page, args: string[]): Promise<Response> {
	const target = args[0];
	if (!target) {
		return {
			ok: false,
			error: "Usage: browse wait hidden <selector|@ref>",
		};
	}

	const resolved = resolveLocator(page, target);
	if ("error" in resolved) {
		return { ok: false, error: resolved.error };
	}

	while (true) {
		try {
			const visible = await resolved.locator.first().isVisible();
			if (!visible) {
				return { ok: true, data: `Element "${target}" is hidden` };
			}
		} catch {
			// Element not found = hidden
			return { ok: true, data: `Element "${target}" is hidden` };
		}
		await sleep(POLL_INTERVAL_MS);
	}
}

async function waitNetworkIdle(page: Page): Promise<Response> {
	try {
		await page.waitForLoadState("networkidle");
		return { ok: true, data: "Reached network idle" };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			error: `Timed out waiting for network idle: ${message}`,
		};
	}
}

async function waitDelay(ms: number): Promise<Response> {
	if (ms <= 0) {
		return {
			ok: false,
			error: "Delay must be a positive number of milliseconds.",
		};
	}
	await sleep(ms);
	return { ok: true, data: `Waited ${ms}ms` };
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
