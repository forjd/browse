/**
 * Example browse plugin — adds a `timing` command that reports page load timing
 * and a `beforeCommand` hook that logs every command to session state.
 *
 * Usage:
 *   1. Add to browse.config.json: { "plugins": ["./examples/plugin-example.ts"] }
 *   2. Run: browse timing
 *   3. Run: browse timing --json
 */
import type { BrowsePlugin } from "../src/plugin.ts";

const plugin: BrowsePlugin = {
	name: "browse-plugin-timing",
	version: "1.0.0",

	commands: [
		{
			name: "timing",
			summary: "Show page load timing metrics",
			usage: `browse timing [--json]

Reports Navigation Timing API metrics for the current page.

Flags:
  --json   Output as JSON`,
			flags: ["--json"],

			handler: async (ctx) => {
				const url = ctx.page.url();
				if (url === "about:blank") {
					return { ok: false, error: "Navigate to a page first." };
				}

				const timing = await ctx.page.evaluate(() => {
					const nav = performance.getEntriesByType(
						"navigation",
					)[0] as PerformanceNavigationTiming;
					if (!nav) return null;
					return {
						ttfb: Math.round(nav.responseStart - nav.requestStart),
						domContentLoaded: Math.round(
							nav.domContentLoadedEventEnd - nav.startTime,
						),
						load: Math.round(nav.loadEventEnd - nav.startTime),
						domInteractive: Math.round(nav.domInteractive - nav.startTime),
						transferSize: nav.transferSize,
					};
				});

				if (!timing) {
					return {
						ok: false,
						error: "No navigation timing data available.",
					};
				}

				if (ctx.request.json) {
					return {
						ok: true,
						data: JSON.stringify({ url, ...timing }, null, 2),
					};
				}

				return {
					ok: true,
					data: [
						`Timing for ${url}`,
						`  TTFB:               ${timing.ttfb}ms`,
						`  DOM Interactive:     ${timing.domInteractive}ms`,
						`  DOM Content Loaded:  ${timing.domContentLoaded}ms`,
						`  Full Load:           ${timing.load}ms`,
						`  Transfer Size:       ${(timing.transferSize / 1024).toFixed(1)}KB`,
					].join("\n"),
				};
			},
		},
	],

	hooks: {
		init: async (config) => {
			console.error(
				`[timing plugin] Loaded${config ? " (config found)" : " (no config)"}`,
			);
		},

		beforeCommand: async (cmd, ctx) => {
			// Track command history in session state
			const history = (ctx.sessionState.history ?? []) as string[];
			history.push(`${cmd} @ ${new Date().toISOString()}`);
			ctx.sessionState.history = history;
		},

		cleanup: async () => {
			console.error("[timing plugin] Shutting down");
		},
	},
};

export default plugin;
