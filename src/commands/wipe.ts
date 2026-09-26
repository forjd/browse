import type { BrowserContext, Page, Route } from "playwright";
import type { Response } from "../protocol.ts";
import type { TabRegistry } from "./tab.ts";

export type WipeDeps = {
	context: BrowserContext;
	tabRegistry: TabRegistry;
	clearRefs: () => void;
};

/**
 * Clear all session data without killing the daemon.
 * Continues through failures and reports warnings for any step that errors.
 */
export async function handleWipe(deps: WipeDeps): Promise<Response> {
	const { context, tabRegistry, clearRefs } = deps;
	const warnings: string[] = [];

	// 1. Close all tabs except the first
	while (tabRegistry.tabs.length > 1) {
		const removed = tabRegistry.tabs.pop();
		if (removed) {
			try {
				await removed.page.close();
			} catch (err) {
				warnings.push(
					`Failed to close tab: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}
	tabRegistry.activeTabIndex = 0;

	// 2. Clear localStorage and sessionStorage for the tab's own origin. This has
	// to happen *before* the about:blank navigation below: web storage is keyed
	// by origin, and about:blank has an opaque one, so clearing there is a silent
	// no-op that leaves the site's storage intact.
	const page = tabRegistry.tabs[0].page;
	try {
		await page.evaluate(clearDomStorage);
	} catch (err) {
		warnings.push(
			`Failed to clear storage: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	// 3. Clear web storage for every *other* origin the session touched. Step 2
	// only ever reaches the one origin the tab happens to be on, so without this
	// a multi-origin session keeps whatever it stored elsewhere.
	await clearOtherOrigins(context, page, warnings);

	// 4. Clear cookies
	try {
		await context.clearCookies();
	} catch (err) {
		warnings.push(
			`Failed to clear cookies: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	// 5. Navigate remaining tab to about:blank
	try {
		await page.goto("about:blank");
	} catch (err) {
		warnings.push(
			`Failed to navigate to about:blank: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	// 6. Clear console buffer
	tabRegistry.tabs[0].consoleBuffer.clear();

	// 7. Clear network buffer
	tabRegistry.tabs[0].networkBuffer.clear();

	// 8. Invalidate refs
	clearRefs();

	if (warnings.length > 0) {
		const warningLines = warnings.map((w) => `  ⚠ ${w}`).join("\n");
		return {
			ok: true,
			data: `Session wiped (with warnings).\n${warningLines}`,
		};
	}

	return { ok: true, data: "Session wiped." };
}

/** Runs inside the page: clears the web storage visible to its origin. */
function clearDomStorage() {
	try {
		localStorage.clear();
	} catch {}
	try {
		sessionStorage.clear();
	} catch {}
}

/**
 * Clear web storage for the origins the context still holds data for, skipping
 * the tab's current origin — the caller already cleared that one in place.
 *
 * Chromium can do this without navigating, via CDP `Storage.clearDataForOrigin`,
 * which also reaches IndexedDB, cache storage and service workers. Firefox and
 * WebKit have no equivalent, so there we walk the origins in the tab instead,
 * serving each a blank document from an intercepted route so the visit costs no
 * network round trip. The tab is about to land on about:blank either way, so
 * borrowing it loses nothing.
 */
async function clearOtherOrigins(
	context: BrowserContext,
	page: Page,
	warnings: string[],
): Promise<void> {
	const current = httpOrigin(page.url());

	let origins: string[];
	try {
		const state = await context.storageState();
		origins = state.origins
			.map((entry) => entry.origin)
			.filter((origin) => origin !== current);
	} catch (err) {
		warnings.push(
			`Failed to list stored origins: ${err instanceof Error ? err.message : String(err)}`,
		);
		return;
	}

	if (origins.length === 0) return;

	const cdp = await openCdpSession(context, page);
	try {
		for (const origin of origins) {
			try {
				if (cdp) {
					await cdp.send("Storage.clearDataForOrigin", {
						origin,
						storageTypes: "all",
					});
				} else {
					await clearOriginByVisiting(page, origin);
				}
			} catch (err) {
				warnings.push(
					`Failed to clear storage for ${origin}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	} finally {
		if (cdp) await cdp.detach().catch(() => {});
	}
}

type CdpSession = Awaited<ReturnType<BrowserContext["newCDPSession"]>>;

/** Returns null on any browser that cannot give us a CDP session. */
async function openCdpSession(
	context: BrowserContext,
	page: Page,
): Promise<CdpSession | null> {
	if (typeof context.newCDPSession !== "function") return null;
	try {
		return await context.newCDPSession(page);
	} catch {
		return null;
	}
}

/** Loads a blank document on `origin` just long enough to clear its storage. */
async function clearOriginByVisiting(page: Page, origin: string) {
	const matchesOrigin = (url: URL) => url.origin === origin;
	const serveBlank = (route: Route) =>
		route.fulfill({ status: 200, contentType: "text/html", body: "" });

	await page.route(matchesOrigin, serveBlank);
	try {
		await page.goto(`${origin}/`);
		await page.evaluate(clearDomStorage);
	} finally {
		await page.unroute(matchesOrigin, serveBlank);
	}
}

/** The origin of `url`, or null for about:blank, data: and other opaque URLs. */
function httpOrigin(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}
		return parsed.origin;
	} catch {
		return null;
	}
}
