import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

type I18nCheck = {
	locale: string;
	untranslatedKeys: string[];
	overflows: {
		element: string;
		contentWidth: number;
		containerWidth: number;
	}[];
	isRtl: boolean;
	rtlIssues: string[];
};

export async function handleI18n(
	page: Page,
	args: string[],
	options?: { json?: boolean },
): Promise<Response> {
	const jsonOutput = options?.json ?? false;

	if (args.length === 0) {
		return {
			ok: false,
			error: `Usage: browse i18n [--url <url>] --locales <en,fr,de,...> [--pattern <regex>]

Check pages across multiple locales for translation and layout issues.

Subcommands:
  check-keys --url <url> --pattern <regex>   Check for untranslated string patterns
  rtl-check --url <url> --locale <locale>    Verify RTL layout

Flags:
  --locales <list>    Comma-separated locale codes
  --url <url>         URL to test
  --pattern <regex>   Regex pattern for untranslated keys (default: uppercase SNAKE_CASE)
  --json              Output as JSON`,
		};
	}

	const sub = args[0];
	const urlIdx = args.indexOf("--url");
	const targetUrl =
		urlIdx !== -1 && urlIdx + 1 < args.length ? args[urlIdx + 1] : undefined;

	const localesIdx = args.indexOf("--locales");
	const locales =
		localesIdx !== -1 && localesIdx + 1 < args.length
			? args[localesIdx + 1].split(",")
			: [];

	const patternIdx = args.indexOf("--pattern");
	const keyPattern =
		patternIdx !== -1 && patternIdx + 1 < args.length
			? args[patternIdx + 1]
			: "[A-Z][A-Z_]+\\.[A-Z_]+";

	if (sub === "check-keys" || sub === "check") {
		if (!targetUrl) {
			return { ok: false, error: "Missing --url flag" };
		}

		try {
			await page.goto(targetUrl, {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});

			const untranslated = await page.evaluate((pattern) => {
				const regex = new RegExp(pattern, "g");
				const text = document.body.innerText;
				const matches = text.match(regex) ?? [];
				return [...new Set(matches)];
			}, keyPattern);

			if (jsonOutput) {
				return {
					ok: true,
					data: JSON.stringify({
						url: targetUrl,
						pattern: keyPattern,
						untranslatedKeys: untranslated,
						count: untranslated.length,
					}),
				};
			}

			if (untranslated.length === 0) {
				return {
					ok: true,
					data: `No untranslated keys found matching pattern: ${keyPattern}`,
				};
			}

			const lines = [
				`Found ${untranslated.length} potential untranslated key(s):`,
			];
			for (const key of untranslated) {
				lines.push(`  - ${key}`);
			}
			return { ok: true, data: lines.join("\n") };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { ok: false, error: `i18n check failed: ${message}` };
		}
	}

	if (sub === "rtl-check") {
		const localeIdx = args.indexOf("--locale");
		const locale =
			localeIdx !== -1 && localeIdx + 1 < args.length
				? args[localeIdx + 1]
				: "ar";

		if (!targetUrl) {
			return { ok: false, error: "Missing --url flag" };
		}

		try {
			// Apply the requested locale before navigating so the server
			// can respond with locale-appropriate content/direction.
			await page.setExtraHTTPHeaders({ "Accept-Language": locale });
			await page.goto(targetUrl, {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});

			// Set the document lang attribute to match the requested locale
			// so that CSS :lang() selectors and RTL behaviour activate.
			await page.evaluate((loc) => {
				document.documentElement.setAttribute("lang", loc);
			}, locale);

			const rtlInfo = await page.evaluate(() => {
				const html = document.documentElement;
				const dir = html.getAttribute("dir") || "";
				const computedDir = getComputedStyle(html).direction;
				const isRtl = dir === "rtl" || computedDir === "rtl";

				// Check for overflow issues
				const overflows: {
					element: string;
					contentWidth: number;
					containerWidth: number;
				}[] = [];
				const elements = document.querySelectorAll(
					"p, h1, h2, h3, span, a, button, label, li",
				);
				for (const el of elements) {
					const htmlEl = el as HTMLElement;
					if (htmlEl.scrollWidth > htmlEl.clientWidth + 2) {
						overflows.push({
							element: `${el.tagName.toLowerCase()}: "${htmlEl.innerText?.slice(0, 40)}"`,
							contentWidth: htmlEl.scrollWidth,
							containerWidth: htmlEl.clientWidth,
						});
					}
				}

				return { isRtl, dir, computedDir, overflows: overflows.slice(0, 10) };
			});

			if (jsonOutput) {
				return {
					ok: true,
					data: JSON.stringify({
						locale,
						url: targetUrl,
						...rtlInfo,
					}),
				};
			}

			const lines = [`RTL Check (${locale}): ${targetUrl}`];
			lines.push(
				`  Direction: ${rtlInfo.isRtl ? "RTL" : "LTR"} (dir="${rtlInfo.dir}", computed="${rtlInfo.computedDir}")`,
			);

			if (!rtlInfo.isRtl) {
				lines.push(`  [WARN] Page direction is not RTL for locale ${locale}`);
			}

			if (rtlInfo.overflows.length > 0) {
				lines.push(
					`  [WARN] ${rtlInfo.overflows.length} element(s) with text overflow:`,
				);
				for (const ov of rtlInfo.overflows) {
					lines.push(
						`    - ${ov.element} (${ov.contentWidth}px content, ${ov.containerWidth}px container)`,
					);
				}
			} else {
				lines.push("  [PASS] No text overflow detected");
			}

			// Reset headers after RTL check
			await page.setExtraHTTPHeaders({});

			return { ok: true, data: lines.join("\n") };
		} catch (err) {
			// Reset headers even on failure
			await page.setExtraHTTPHeaders({}).catch(() => {});
			const message = err instanceof Error ? err.message : String(err);
			return { ok: false, error: `RTL check failed: ${message}` };
		}
	}

	// Multi-locale comparison
	if (locales.length === 0) {
		return {
			ok: false,
			error: "Provide --locales <en,fr,de,...> for multi-locale testing",
		};
	}

	if (!targetUrl) {
		return { ok: false, error: "Provide --url <url> for multi-locale testing" };
	}

	const results: I18nCheck[] = [];

	for (const locale of locales) {
		try {
			// Navigate with locale header
			await page.setExtraHTTPHeaders({ "Accept-Language": locale });
			await page.goto(targetUrl, {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});

			const checkResult = await page.evaluate(
				(opts) => {
					const regex = new RegExp(opts.pattern, "g");
					const text = document.body.innerText;
					const untranslated = [...new Set(text.match(regex) ?? [])];

					const isRtl =
						document.documentElement.getAttribute("dir") === "rtl" ||
						getComputedStyle(document.documentElement).direction === "rtl";

					const overflows: {
						element: string;
						contentWidth: number;
						containerWidth: number;
					}[] = [];
					const elements = document.querySelectorAll(
						"p, h1, h2, h3, span, a, button, label",
					);
					for (const el of elements) {
						const htmlEl = el as HTMLElement;
						if (htmlEl.scrollWidth > htmlEl.clientWidth + 2) {
							overflows.push({
								element: `${el.tagName.toLowerCase()}: "${htmlEl.innerText?.slice(0, 30)}"`,
								contentWidth: htmlEl.scrollWidth,
								containerWidth: htmlEl.clientWidth,
							});
						}
					}

					return {
						untranslated,
						isRtl,
						overflows: overflows.slice(0, 5),
					};
				},
				{ pattern: keyPattern },
			);

			results.push({
				locale,
				untranslatedKeys: checkResult.untranslated,
				overflows: checkResult.overflows,
				isRtl: checkResult.isRtl,
				rtlIssues: [],
			});
		} catch {
			results.push({
				locale,
				untranslatedKeys: [],
				overflows: [],
				isRtl: false,
				rtlIssues: [`Failed to load page for locale ${locale}`],
			});
		}
	}

	// Reset headers
	await page.setExtraHTTPHeaders({});

	if (jsonOutput) {
		return {
			ok: true,
			data: JSON.stringify({ url: targetUrl, locales: results }),
		};
	}

	const lines = [`i18n Comparison: ${targetUrl}`];
	lines.push(`Locales: ${locales.join(", ")}`);
	lines.push("");

	for (const result of results) {
		lines.push(`Locale: ${result.locale}`);
		if (result.untranslatedKeys.length > 0) {
			lines.push(
				`  [FAIL] ${result.untranslatedKeys.length} untranslated key(s): ${result.untranslatedKeys.slice(0, 5).join(", ")}`,
			);
		} else {
			lines.push("  [PASS] No untranslated keys found");
		}
		if (result.overflows.length > 0) {
			lines.push(`  [WARN] ${result.overflows.length} text overflow(s)`);
		}
		lines.push("");
	}

	const totalKeys = results.reduce(
		(sum, r) => sum + r.untranslatedKeys.length,
		0,
	);
	const totalOverflows = results.reduce(
		(sum, r) => sum + r.overflows.length,
		0,
	);
	lines.push(
		`Summary: ${totalKeys} untranslated key(s), ${totalOverflows} overflow(s)`,
	);

	return { ok: true, data: lines.join("\n") };
}
