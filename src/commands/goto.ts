import { devices, type Page } from "playwright";
import type { Response } from "../protocol.ts";
import { handleSnapshot } from "./snapshot.ts";
import { PRESETS } from "./viewport.ts";

type NavigationResponse = Awaited<ReturnType<Page["goto"]>>;
type GotoViewport =
	| { action: "set"; width: number; height: number; label?: string }
	| { error: string };

const BODY_SNIPPET_LIMIT = 500;

/**
 * Parse viewport-related flags from goto args.
 * Returns the viewport config (if any), the URL, and any parse errors.
 */
function parseGotoArgs(args: string[]): {
	url: string | undefined;
	viewport: GotoViewport | null;
} {
	let device: string | undefined;
	let preset: string | undefined;
	let viewportSize: string | undefined;
	const positional: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--device") {
			device = args[++i];
		} else if (arg === "--preset") {
			preset = args[++i];
		} else if (arg === "--viewport") {
			viewportSize = args[++i];
		} else if (arg === "--auto-snapshot") {
			// Handled by the caller, skip
		} else if (!arg.startsWith("--")) {
			positional.push(arg);
		}
	}

	const url = positional[0];

	// No viewport flags — no viewport change
	if (!device && !preset && !viewportSize) {
		return { url, viewport: null };
	}

	// Mutual exclusivity
	const flagCount = [device, preset, viewportSize].filter(Boolean).length;
	if (flagCount > 1) {
		return {
			url,
			viewport: {
				error: "--viewport, --device, and --preset are mutually exclusive.",
			},
		};
	}

	if (device) {
		const descriptor = devices[device];
		if (!descriptor?.viewport) {
			return { url, viewport: { error: `Unknown device: "${device}".` } };
		}
		return {
			url,
			viewport: {
				action: "set",
				width: descriptor.viewport.width,
				height: descriptor.viewport.height,
				label: device,
			},
		};
	}

	if (preset) {
		const size = PRESETS[preset];
		if (!size) {
			const valid = Object.keys(PRESETS).join(", ");
			return {
				url,
				viewport: {
					error: `Unknown preset: "${preset}". Valid presets: ${valid}.`,
				},
			};
		}
		return { url, viewport: { action: "set", ...size, label: preset } };
	}

	// --viewport WxH
	if (viewportSize) {
		const match = viewportSize.match(/^(\d+)[xX](\d+)$/);
		if (!match) {
			return {
				url,
				viewport: { error: "Expected WxH format (e.g. 320x568)." },
			};
		}
		const width = Number(match[1]);
		const height = Number(match[2]);
		if (width <= 0 || height <= 0) {
			return {
				url,
				viewport: { error: "Width and height must be positive integers." },
			};
		}
		return { url, viewport: { action: "set", width, height } };
	}

	return { url, viewport: null };
}

function cleanSnippet(text: string): string {
	return text.replace(/\s+/g, " ").trim().slice(0, BODY_SNIPPET_LIMIT);
}

function extractTitle(html: string): string | undefined {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	return match?.[1] ? cleanSnippet(match[1]) : undefined;
}

function isLikelyCdnAccessDenied(
	status: number,
	headers: Record<string, string>,
	bodySnippet: string,
	title?: string,
): boolean {
	if (status !== 403) return false;
	const haystack = [
		headers.server,
		headers["x-cache"],
		headers["x-akamai-transformed"],
		bodySnippet,
		title,
	]
		.filter(Boolean)
		.join("\n")
		.toLowerCase();
	return (
		haystack.includes("akamai") ||
		haystack.includes("access denied") ||
		haystack.includes("bot") ||
		haystack.includes("forbidden")
	);
}

function isViewportSet(
	viewport: GotoViewport | null,
): viewport is Extract<GotoViewport, { action: "set" }> {
	return Boolean(viewport && "action" in viewport && viewport.action === "set");
}

async function formatNavigationHttpError(
	response: NavigationResponse,
): Promise<string | undefined> {
	if (!response) return undefined;
	const status = response.status();
	if (status < 400) return undefined;

	const statusText = response.statusText();
	const headers = response.headers();
	let bodySnippet = "";
	try {
		bodySnippet = cleanSnippet(await response.text());
	} catch {
		// Some responses cannot be read after navigation; headers/status still help.
	}
	const title = bodySnippet ? extractTitle(bodySnippet) : undefined;
	const lines = [`HTTP ${status}${statusText ? ` ${statusText}` : ""}`];
	lines.push(`URL: ${response.url()}`);

	const server = headers.server;
	if (server) lines.push(`Server: ${server}`);
	const contentType = headers["content-type"];
	if (contentType) lines.push(`Content-Type: ${contentType}`);
	if (title) lines.push(`Title: ${title}`);
	if (bodySnippet) lines.push(`Body: ${bodySnippet}`);

	if (isLikelyCdnAccessDenied(status, headers, bodySnippet, title)) {
		lines.push(
			"Detected likely CDN/bot-protection access denial. If this target is authorized, retry with an appropriate configured browser profile or proxy (for example --proxy/BROWSE_PROXY).",
		);
	}

	return lines.join("\n");
}

export async function handleGoto(
	page: Page,
	args: string[],
	options?: { autoSnapshot?: boolean },
): Promise<Response> {
	const { url, viewport } = parseGotoArgs(args);

	if (!url) {
		return { ok: false, error: "Usage: browse goto <url>" };
	}

	if (viewport && "error" in viewport) {
		return { ok: false, error: viewport.error };
	}

	try {
		// Resize viewport before navigating
		if (isViewportSet(viewport)) {
			await page.setViewportSize({
				width: viewport.width,
				height: viewport.height,
			});
		}

		const navigationResponse = await page.goto(url, {
			waitUntil: "domcontentloaded",
			timeout: 30_000,
		});
		const httpError = await formatNavigationHttpError(navigationResponse);
		if (httpError) {
			return { ok: false, error: httpError };
		}

		// Inject stealth patches to fix CreepJS detection.
		// This runs on every navigation since addInitScript only affects new pages.
		try {
			await page.evaluate(() => {
				// Only inject once per page
				const globalWindow = window as unknown as Record<string, unknown>;
				if (globalWindow.__stealthGotoInjected) return;
				globalWindow.__stealthGotoInjected = true;

				// Override getComputedStyle to fix ActiveText
				const originalGetComputedStyle = window.getComputedStyle;
				window.getComputedStyle = function getComputedStyle(
					elem: Element,
					pseudoElt?: string | null,
				) {
					const style = originalGetComputedStyle.call(window, elem, pseudoElt);
					if (elem instanceof HTMLElement) {
						const inlineBg = elem.style.backgroundColor;
						const elemStyle = elem.getAttribute("style");
						if (
							inlineBg.toLowerCase() === "activetext" ||
							elemStyle?.includes("ActiveText")
						) {
							return new Proxy(style, {
								get(target, prop) {
									if (prop === "backgroundColor") {
										return "rgb(0, 0, 0)";
									}
									return (target as Record<string | symbol, unknown>)[prop];
								},
							});
						}
					}
					return style;
				};
			});
		} catch {
			// Injection may fail on some pages (e.g., about:blank)
		}

		const title = await page.title();

		let result: string;
		if (isViewportSet(viewport)) {
			const suffix = viewport.label ? ` (${viewport.label})` : "";
			result = `${title} [${viewport.width}x${viewport.height}${suffix}]`;
		} else {
			result = title;
		}

		// Auto-snapshot: refresh refs so agent can immediately interact
		if (options?.autoSnapshot) {
			const snapshotResult = await handleSnapshot(page, []);
			if (snapshotResult.ok) {
				return { ok: true, data: `${result}\n\n${snapshotResult.data}` };
			}
		}

		return { ok: true, data: result };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
