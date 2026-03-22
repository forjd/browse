import { existsSync, readFileSync } from "node:fs";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

type DesignAuditResult = {
	url: string;
	colors: {
		value: string;
		count: number;
		matchedToken?: string;
		distance?: number;
	}[];
	fonts: { value: string; count: number; matchedToken?: string }[];
	fontSizes: { value: string; count: number; matchedToken?: string }[];
	unmatchedColors: number;
	unmatchedFonts: number;
	deadTokens: string[];
};

export async function handleDesignAudit(
	page: Page,
	args: string[],
	options?: { json?: boolean },
): Promise<Response> {
	const jsonOutput = options?.json ?? false;

	const tokensIdx = args.indexOf("--tokens");
	const extractOnly = args.includes("--extract");

	if (!extractOnly && (tokensIdx === -1 || tokensIdx + 1 >= args.length)) {
		return {
			ok: false,
			error: `Usage: browse design-audit --tokens <tokens.json> [--check colors,fonts] [--selector <sel>] [--json]
       browse design-audit --extract [--json]

Compares live page computed styles against design tokens.

Token file format:
  {
    "colors": { "primary": "#1a73e8", "secondary": "#5f6368" },
    "fonts": { "heading": "Inter, sans-serif", "body": "Roboto, sans-serif" },
    "fontSize": { "sm": "14px", "base": "16px", "lg": "18px" }
  }`,
		};
	}

	const selectorIdx = args.indexOf("--selector");
	const selector =
		selectorIdx !== -1 && selectorIdx + 1 < args.length
			? args[selectorIdx + 1]
			: "body";

	try {
		// Extract computed styles from the page
		const styles = await page.evaluate((sel) => {
			const colorMap = new Map<string, number>();
			const fontMap = new Map<string, number>();
			const sizeMap = new Map<string, number>();

			const root = document.querySelector(sel);
			if (!root) return { colors: [], fonts: [], fontSizes: [] };

			const elements = root.querySelectorAll("*");
			for (const el of elements) {
				const computed = getComputedStyle(el);

				// Colors
				for (const prop of ["color", "backgroundColor", "borderColor"]) {
					const val = computed.getPropertyValue(
						prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
					);
					if (val && val !== "rgba(0, 0, 0, 0)" && val !== "transparent") {
						colorMap.set(val, (colorMap.get(val) ?? 0) + 1);
					}
				}

				// Fonts
				const fontFamily = computed.fontFamily;
				if (fontFamily) {
					const primary = fontFamily.split(",")[0].trim().replace(/['"]/g, "");
					fontMap.set(primary, (fontMap.get(primary) ?? 0) + 1);
				}

				// Font sizes
				const fontSize = computed.fontSize;
				if (fontSize) {
					sizeMap.set(fontSize, (sizeMap.get(fontSize) ?? 0) + 1);
				}
			}

			return {
				colors: [...colorMap.entries()]
					.map(([value, count]) => ({ value, count }))
					.sort((a, b) => b.count - a.count)
					.slice(0, 30),
				fonts: [...fontMap.entries()]
					.map(([value, count]) => ({ value, count }))
					.sort((a, b) => b.count - a.count),
				fontSizes: [...sizeMap.entries()]
					.map(([value, count]) => ({ value, count }))
					.sort((a, b) => b.count - a.count),
			};
		}, selector);

		if (extractOnly) {
			if (jsonOutput) {
				return { ok: true, data: JSON.stringify(styles) };
			}
			const lines = ["Extracted Styles:"];
			lines.push("\nColors:");
			for (const c of styles.colors) {
				lines.push(`  ${c.value} (${c.count} uses)`);
			}
			lines.push("\nFonts:");
			for (const f of styles.fonts) {
				lines.push(`  ${f.value} (${f.count} uses)`);
			}
			lines.push("\nFont Sizes:");
			for (const s of styles.fontSizes) {
				lines.push(`  ${s.value} (${s.count} uses)`);
			}
			return { ok: true, data: lines.join("\n") };
		}

		// Load tokens
		const tokensPath = args[tokensIdx + 1];
		if (!existsSync(tokensPath)) {
			return {
				ok: false,
				error: `Token file not found: ${tokensPath}`,
			};
		}

		const tokens = JSON.parse(readFileSync(tokensPath, "utf-8"));
		const tokenColors = (tokens.colors ?? {}) as Record<string, string>;
		const tokenFonts = (tokens.fonts ?? {}) as Record<string, string>;
		const tokenFontSizes = (tokens.fontSize ?? {}) as Record<string, string>;

		// Compare colors
		const usedTokenColors = new Set<string>();
		const colorResults = styles.colors.map((c) => {
			const hex = rgbToHex(c.value);
			for (const [name, tokenHex] of Object.entries(tokenColors)) {
				if (
					hex.toLowerCase() === tokenHex.toLowerCase() ||
					c.value === tokenHex
				) {
					usedTokenColors.add(name);
					return { ...c, matchedToken: name, distance: 0 };
				}
			}
			return { ...c, matchedToken: undefined, distance: undefined };
		});

		// Compare fonts
		const usedTokenFonts = new Set<string>();
		const fontResults = styles.fonts.map((f) => {
			for (const [name, tokenFont] of Object.entries(tokenFonts)) {
				const primary = tokenFont.split(",")[0].trim().replace(/['"]/g, "");
				if (f.value.toLowerCase() === primary.toLowerCase()) {
					usedTokenFonts.add(name);
					return { ...f, matchedToken: name };
				}
			}
			return { ...f, matchedToken: undefined };
		});

		// Compare font sizes
		const sizeResults = styles.fontSizes.map((s) => {
			for (const [name, tokenSize] of Object.entries(tokenFontSizes)) {
				if (s.value === tokenSize) {
					return { ...s, matchedToken: name };
				}
			}
			return { ...s, matchedToken: undefined };
		});

		// Dead tokens
		const deadColors = Object.keys(tokenColors).filter(
			(k) => !usedTokenColors.has(k),
		);
		const deadFonts = Object.keys(tokenFonts).filter(
			(k) => !usedTokenFonts.has(k),
		);

		const result: DesignAuditResult = {
			url: page.url(),
			colors: colorResults,
			fonts: fontResults,
			fontSizes: sizeResults,
			unmatchedColors: colorResults.filter((c) => !c.matchedToken).length,
			unmatchedFonts: fontResults.filter((f) => !f.matchedToken).length,
			deadTokens: [...deadColors, ...deadFonts],
		};

		if (jsonOutput) {
			return { ok: true, data: JSON.stringify(result) };
		}

		return { ok: true, data: formatDesignReport(result) };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			error: `Design audit failed: ${message}`,
		};
	}
}

function formatDesignReport(result: DesignAuditResult): string {
	const lines: string[] = [];
	lines.push(`Design Token Audit: ${result.url}`);
	lines.push("=".repeat(50));
	lines.push("");

	lines.push("Colors");
	for (const c of result.colors.slice(0, 15)) {
		if (c.matchedToken) {
			lines.push(`  [PASS] ${c.value} → "${c.matchedToken}" (${c.count} uses)`);
		} else {
			lines.push(`  [WARN] ${c.value} — not in tokens (${c.count} uses)`);
		}
	}
	lines.push("");

	lines.push("Fonts");
	for (const f of result.fonts) {
		if (f.matchedToken) {
			lines.push(`  [PASS] ${f.value} → "${f.matchedToken}" (${f.count} uses)`);
		} else {
			lines.push(`  [WARN] ${f.value} — not in tokens (${f.count} uses)`);
		}
	}
	lines.push("");

	lines.push("Font Sizes");
	for (const s of result.fontSizes.slice(0, 10)) {
		if (s.matchedToken) {
			lines.push(`  [PASS] ${s.value} → "${s.matchedToken}" (${s.count} uses)`);
		} else {
			lines.push(`  [WARN] ${s.value} — off scale (${s.count} uses)`);
		}
	}
	lines.push("");

	if (result.deadTokens.length > 0) {
		lines.push(`Dead tokens (unused): ${result.deadTokens.join(", ")}`);
		lines.push("");
	}

	lines.push(
		`Summary: ${result.unmatchedColors} unmatched color(s), ${result.unmatchedFonts} unmatched font(s), ${result.deadTokens.length} dead token(s)`,
	);
	return lines.join("\n");
}

function rgbToHex(rgb: string): string {
	const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
	if (!match) return rgb;
	const r = Number.parseInt(match[1], 10);
	const g = Number.parseInt(match[2], 10);
	const b = Number.parseInt(match[3], 10);
	return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
