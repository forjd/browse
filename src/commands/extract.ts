import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { resolveRef } from "../refs.ts";
import { compileSafePattern } from "../safe-pattern.ts";

function parseFilter(args: string[]): string | null {
	const idx = args.indexOf("--filter");
	if (idx === -1 || idx + 1 >= args.length) return null;
	return args[idx + 1];
}

function parseAttr(args: string[]): string | null {
	const idx = args.indexOf("--attr");
	if (idx === -1 || idx + 1 >= args.length) return null;
	return args[idx + 1];
}

export function formatTable(
	headers: string[],
	rows: string[][],
	csv: boolean,
): string {
	if (csv) {
		const lines = [headers.join(",")];
		for (const row of rows) {
			lines.push(
				row
					.map((cell) => {
						if (
							cell.includes(",") ||
							cell.includes('"') ||
							cell.includes("\n")
						) {
							return `"${cell.replace(/"/g, '""')}"`;
						}
						return cell;
					})
					.join(","),
			);
		}
		return lines.join("\n");
	}

	// Plain text table
	const widths = headers.map((h, i) =>
		Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
	);

	const lines: string[] = [];
	lines.push(headers.map((h, i) => h.padEnd(widths[i])).join("  "));
	lines.push(widths.map((w) => "-".repeat(w)).join("  "));
	for (const row of rows) {
		lines.push(row.map((c, i) => (c ?? "").padEnd(widths[i])).join("  "));
	}

	return lines.join("\n");
}

export function formatLinks(
	links: { href: string; text: string }[],
	filter: string | null,
): string {
	let filtered = links;
	if (filter) {
		try {
			const re = compileSafePattern(filter);
			filtered = links.filter((l) => re.test(l.href));
		} catch {
			filtered = links.filter((l) => l.href.includes(filter));
		}
	}

	if (filtered.length === 0) {
		return filter ? `No links matching "${filter}".` : "No links found.";
	}

	const lines = [
		`${filtered.length} link${filtered.length === 1 ? "" : "s"} found:`,
		"",
	];
	for (const l of filtered) {
		const label = l.text.trim() || "(no text)";
		lines.push(`  ${label}`);
		lines.push(`    ${l.href}`);
	}

	return lines.join("\n");
}

async function extractTable(
	page: Page,
	selectorArg: string,
	args: string[],
	jsonOutput: boolean,
): Promise<Response> {
	const csv = args.includes("--csv");

	// Resolve @ref if needed
	let selector = selectorArg;
	if (selectorArg.startsWith("@")) {
		const resolved = resolveRef(selectorArg);
		if ("error" in resolved) {
			return { ok: false, error: resolved.error };
		}
		if (resolved.role !== "table") {
			return {
				ok: false,
				error: `Ref ${selectorArg} points to a "${resolved.role}" element, not a table.`,
			};
		}
		// Build a selector that targets this specific table via nth-match
		selector =
			resolved.totalMatches > 1
				? `table:nth-of-type(${resolved.nthMatch})`
				: "table";
	}

	const tableData = await page.evaluate((sel) => {
		const table = document.querySelector(sel);
		if (!table) return null;

		const headers: string[] = [];
		const rows: string[][] = [];

		const ths = table.querySelectorAll("thead th, thead td, tr:first-child th");
		if (ths.length > 0) {
			for (const th of ths) {
				headers.push(
					(th as HTMLElement).innerText?.trim() ?? th.textContent?.trim() ?? "",
				);
			}
		}

		// Select body rows, excluding any inside thead
		const hasTbody = table.querySelector("tbody");
		const allRows = hasTbody
			? table.querySelectorAll("tbody tr")
			: table.querySelectorAll("tr");
		const bodyRows = Array.from(allRows).filter((tr) => !tr.closest("thead"));
		const startIdx = headers.length > 0 && !hasTbody ? 1 : 0;

		for (let i = startIdx; i < bodyRows.length; i++) {
			const cells = bodyRows[i].querySelectorAll("td, th");
			const row: string[] = [];
			for (const cell of cells) {
				row.push(
					(cell as HTMLElement).innerText?.trim() ??
						cell.textContent?.trim() ??
						"",
				);
			}
			if (row.length > 0) {
				rows.push(row);
			}
		}

		// If no headers found, use column indices
		if (headers.length === 0 && rows.length > 0) {
			for (let i = 0; i < rows[0].length; i++) {
				headers.push(`col${i + 1}`);
			}
		}

		return { headers, rows };
	}, selector);

	if (!tableData) {
		return { ok: false, error: `No table found matching "${selector}".` };
	}

	if (jsonOutput) {
		const objects = tableData.rows.map((row) => {
			const obj: Record<string, string> = {};
			for (let i = 0; i < tableData.headers.length; i++) {
				obj[tableData.headers[i]] = row[i] ?? "";
			}
			return obj;
		});
		return { ok: true, data: JSON.stringify(objects) };
	}

	return {
		ok: true,
		data: formatTable(tableData.headers, tableData.rows, csv),
	};
}

async function extractLinks(
	page: Page,
	args: string[],
	jsonOutput: boolean,
): Promise<Response> {
	const filter = parseFilter(args);

	const links = await page.evaluate(() => {
		const anchors = document.querySelectorAll("a[href]");
		return Array.from(anchors).map((a) => ({
			href: (a as HTMLAnchorElement).href,
			text: (a as HTMLElement).innerText?.trim() ?? a.textContent?.trim() ?? "",
		}));
	});

	if (jsonOutput) {
		let filtered = links;
		if (filter) {
			try {
				const re = new RegExp(filter);
				filtered = links.filter((l) => re.test(l.href));
			} catch {
				filtered = links.filter((l) => l.href.includes(filter));
			}
		}
		return { ok: true, data: JSON.stringify(filtered) };
	}

	return { ok: true, data: formatLinks(links, filter) };
}

async function extractMeta(page: Page, jsonOutput: boolean): Promise<Response> {
	const meta = await page.evaluate(() => {
		const result: Record<string, unknown> = {};

		// Standard meta tags
		const standard: Record<string, string> = {};
		const metaTags = document.querySelectorAll("meta[name], meta[property]");
		for (const tag of metaTags) {
			const name =
				tag.getAttribute("name") || tag.getAttribute("property") || "";
			const content = tag.getAttribute("content") || "";
			if (name) standard[name] = content;
		}
		result.meta = standard;

		// Open Graph
		const og: Record<string, string> = {};
		for (const [key, value] of Object.entries(standard)) {
			if (key.startsWith("og:")) {
				og[key.slice(3)] = value;
			}
		}
		if (Object.keys(og).length > 0) result.openGraph = og;

		// Twitter Card
		const twitter: Record<string, string> = {};
		for (const [key, value] of Object.entries(standard)) {
			if (key.startsWith("twitter:")) {
				twitter[key.slice(8)] = value;
			}
		}
		if (Object.keys(twitter).length > 0) result.twitterCard = twitter;

		// JSON-LD
		const ldScripts = document.querySelectorAll(
			'script[type="application/ld+json"]',
		);
		const jsonLd: unknown[] = [];
		for (const script of ldScripts) {
			try {
				jsonLd.push(JSON.parse(script.textContent || ""));
			} catch {
				// skip invalid JSON-LD
			}
		}
		if (jsonLd.length > 0) result.jsonLd = jsonLd;

		// Title and canonical
		result.title = document.title;
		const canonical = document.querySelector('link[rel="canonical"]');
		if (canonical) {
			result.canonical = canonical.getAttribute("href");
		}

		return result;
	});

	if (jsonOutput) {
		return { ok: true, data: JSON.stringify(meta) };
	}

	// Human-readable format
	const lines: string[] = [];
	lines.push(`Page Meta: ${(meta.title as string) || "(no title)"}`);
	lines.push("");

	if (meta.canonical) {
		lines.push(`Canonical: ${meta.canonical}`);
		lines.push("");
	}

	const metaTags = meta.meta as Record<string, string>;
	if (Object.keys(metaTags).length > 0) {
		lines.push("Meta Tags:");
		for (const [key, value] of Object.entries(metaTags)) {
			lines.push(`  ${key}: ${value}`);
		}
		lines.push("");
	}

	if (meta.openGraph) {
		lines.push("Open Graph:");
		for (const [key, value] of Object.entries(
			meta.openGraph as Record<string, string>,
		)) {
			lines.push(`  ${key}: ${value}`);
		}
		lines.push("");
	}

	if (meta.twitterCard) {
		lines.push("Twitter Card:");
		for (const [key, value] of Object.entries(
			meta.twitterCard as Record<string, string>,
		)) {
			lines.push(`  ${key}: ${value}`);
		}
		lines.push("");
	}

	if (meta.jsonLd) {
		lines.push(
			`JSON-LD: ${(meta.jsonLd as unknown[]).length} block${(meta.jsonLd as unknown[]).length === 1 ? "" : "s"}`,
		);
	}

	return { ok: true, data: lines.join("\n").trimEnd() };
}

async function extractSelect(
	page: Page,
	selector: string,
	args: string[],
	jsonOutput: boolean,
): Promise<Response> {
	const attrName = parseAttr(args);

	const elements = await page.evaluate(
		({ sel, attr }) => {
			const els = document.querySelectorAll(sel);
			return Array.from(els).map((el) => {
				const htmlEl = el as HTMLElement;
				if (attr) {
					return el.getAttribute(attr) ?? "";
				}
				return htmlEl.innerText?.trim() ?? el.textContent?.trim() ?? "";
			});
		},
		{ sel: selector, attr: attrName },
	);

	if (jsonOutput) {
		return { ok: true, data: JSON.stringify(elements) };
	}

	if (elements.length === 0) {
		return { ok: true, data: `No elements found matching "${selector}".` };
	}

	const lines = [
		`${elements.length} element${elements.length === 1 ? "" : "s"} found:`,
		"",
	];
	for (const el of elements) {
		lines.push(`  ${el}`);
	}

	return { ok: true, data: lines.join("\n") };
}

export async function handleExtract(
	page: Page,
	args: string[],
	options?: { json?: boolean },
): Promise<Response> {
	const jsonOutput = options?.json ?? false;

	if (args.length === 0) {
		return {
			ok: false,
			error:
				"Usage: browse extract <subcommand> [args]\n\nSubcommands:\n  table <selector|@ref>    Extract HTML table as JSON/CSV\n  links [--filter <pat>]   Extract all links\n  meta                     Extract meta tags, Open Graph, JSON-LD\n  select <selector>        Extract matching elements",
		};
	}

	const subcommand = args[0];
	const subArgs = args.slice(1);

	switch (subcommand) {
		case "table": {
			const selector = subArgs[0] ?? "table";
			return extractTable(page, selector, subArgs, jsonOutput);
		}
		case "links":
			return extractLinks(page, subArgs, jsonOutput);
		case "meta":
			return extractMeta(page, jsonOutput);
		case "select": {
			if (!subArgs[0]) {
				return {
					ok: false,
					error: "Usage: browse extract select <selector> [--attr <name>]",
				};
			}
			return extractSelect(page, subArgs[0], subArgs, jsonOutput);
		}
		default:
			return {
				ok: false,
				error: `Unknown extract subcommand: "${subcommand}". Use: table, links, meta, select`,
			};
	}
}
