import type { BrowserContext } from "playwright";
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

	// 2. Navigate remaining tab to about:blank
	const page = tabRegistry.tabs[0].page;
	try {
		await page.goto("about:blank");
	} catch (err) {
		warnings.push(
			`Failed to navigate to about:blank: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	// 3. Clear cookies
	try {
		await context.clearCookies();
	} catch (err) {
		warnings.push(
			`Failed to clear cookies: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	// 4. Clear localStorage and sessionStorage
	try {
		await page.evaluate(() => {
			try {
				localStorage.clear();
			} catch {}
			try {
				sessionStorage.clear();
			} catch {}
		});
	} catch (err) {
		warnings.push(
			`Failed to clear storage: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	// 5. Clear console buffer
	tabRegistry.tabs[0].consoleBuffer.clear();

	// 6. Clear network buffer
	tabRegistry.tabs[0].networkBuffer.clear();

	// 7. Invalidate refs
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
