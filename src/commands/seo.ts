import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

type SeoCheck = {
	category: string;
	name: string;
	status: "pass" | "warn" | "fail";
	value?: string;
	recommendation?: string;
};

type SeoReport = {
	url: string;
	checks: SeoCheck[];
	score: number;
};

export async function handleSeo(
	page: Page,
	args: string[],
	options?: { json?: boolean },
): Promise<Response> {
	const jsonOutput = options?.json ?? false;
	const targetUrl = args.find((a) => a.startsWith("http"));

	try {
		if (targetUrl) {
			await page.goto(targetUrl, {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});
		}

		const pageUrl = page.url();

		const data = await page.evaluate(() => {
			const result: Record<string, unknown> = {};

			// Meta tags
			const title = document.querySelector("title");
			result.title = title?.textContent?.trim() ?? null;
			result.titleLength = (result.title as string | null)?.length ?? 0;

			const desc = document.querySelector(
				'meta[name="description"]',
			) as HTMLMetaElement | null;
			result.description = desc?.content?.trim() ?? null;
			result.descriptionLength =
				(result.description as string | null)?.length ?? 0;

			const robots = document.querySelector(
				'meta[name="robots"]',
			) as HTMLMetaElement | null;
			result.robots = robots?.content ?? null;

			const canonical = document.querySelector(
				'link[rel="canonical"]',
			) as HTMLLinkElement | null;
			result.canonical = canonical?.href ?? null;

			const viewport = document.querySelector(
				'meta[name="viewport"]',
			) as HTMLMetaElement | null;
			result.viewport = viewport?.content ?? null;

			const lang = document.documentElement.getAttribute("lang");
			result.lang = lang;

			// Open Graph
			const ogTags: Record<string, string> = {};
			for (const el of document.querySelectorAll('meta[property^="og:"]')) {
				const prop = (el as HTMLMetaElement).getAttribute("property");
				const content = (el as HTMLMetaElement).content;
				if (prop && content) ogTags[prop] = content;
			}
			result.openGraph = ogTags;

			// Twitter Card
			const twTags: Record<string, string> = {};
			for (const el of document.querySelectorAll('meta[name^="twitter:"]')) {
				const name = (el as HTMLMetaElement).name;
				const content = (el as HTMLMetaElement).content;
				if (name && content) twTags[name] = content;
			}
			result.twitterCard = twTags;

			// Headings — collect in DOM order to preserve hierarchy
			const headings: { level: number; text: string }[] = [];
			const headingEls = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
			for (const el of headingEls) {
				headings.push({
					level: Number.parseInt(el.tagName[1], 10),
					text: (el as HTMLElement).innerText?.trim().slice(0, 100) ?? "",
				});
			}
			result.headings = headings;

			// Images
			const images = document.querySelectorAll("img");
			const imgStats = {
				total: images.length,
				missingAlt: 0,
				missingAltSources: [] as string[],
				missingDimensions: 0,
			};
			for (const img of images) {
				if (!img.hasAttribute("alt")) {
					imgStats.missingAlt++;
					imgStats.missingAltSources.push(
						(img.src ?? img.getAttribute("data-src") ?? "").slice(0, 80),
					);
				}
				if (!img.hasAttribute("width") || !img.hasAttribute("height")) {
					imgStats.missingDimensions++;
				}
			}
			result.images = imgStats;

			// Links
			const links = document.querySelectorAll("a[href]");
			let internal = 0;
			let external = 0;
			const genericTexts: string[] = [];
			const origin = window.location.origin;
			for (const a of links) {
				const href = (a as HTMLAnchorElement).href;
				const text = (a as HTMLElement).innerText?.trim() ?? "";
				if (href.startsWith(origin) || href.startsWith("/")) {
					internal++;
				} else {
					external++;
				}
				if (
					["click here", "read more", "learn more", "here"].includes(
						text.toLowerCase(),
					)
				) {
					genericTexts.push(text);
				}
			}
			result.links = {
				internal,
				external,
				genericTexts,
			};

			// Structured data
			const jsonLd: unknown[] = [];
			for (const script of document.querySelectorAll(
				'script[type="application/ld+json"]',
			)) {
				try {
					jsonLd.push(JSON.parse(script.textContent ?? ""));
				} catch {
					// ignore invalid JSON-LD
				}
			}
			result.structuredData = jsonLd;

			// HTTPS
			result.isHttps = window.location.protocol === "https:";

			return result;
		});

		// Build checks
		const checks: SeoCheck[] = [];

		// Title
		if (!data.title) {
			checks.push({
				category: "Meta",
				name: "Title",
				status: "fail",
				recommendation: "Add a <title> tag",
			});
		} else {
			const len = data.titleLength as number;
			if (len < 30 || len > 70) {
				checks.push({
					category: "Meta",
					name: "Title",
					status: "warn",
					value: `"${(data.title as string).slice(0, 60)}${len > 60 ? "..." : ""}" (${len} chars)`,
					recommendation:
						len < 30
							? "Title is short — aim for 50-60 characters"
							: "Title is long — keep under 60-70 characters",
				});
			} else {
				checks.push({
					category: "Meta",
					name: "Title",
					status: "pass",
					value: `"${data.title as string}" (${len} chars)`,
				});
			}
		}

		// Description
		if (!data.description) {
			checks.push({
				category: "Meta",
				name: "Description",
				status: "fail",
				recommendation: 'Add <meta name="description" content="...">',
			});
		} else {
			const len = data.descriptionLength as number;
			if (len < 120 || len > 170) {
				checks.push({
					category: "Meta",
					name: "Description",
					status: "warn",
					value: `${len} chars`,
					recommendation:
						len < 120
							? "Description is short — aim for 150-160 characters"
							: "Description is long — keep under 160-170 characters",
				});
			} else {
				checks.push({
					category: "Meta",
					name: "Description",
					status: "pass",
					value: `${len} chars`,
				});
			}
		}

		// Canonical
		if (!data.canonical) {
			checks.push({
				category: "Meta",
				name: "Canonical URL",
				status: "warn",
				recommendation: 'Add <link rel="canonical" href="...">',
			});
		} else {
			checks.push({
				category: "Meta",
				name: "Canonical URL",
				status: "pass",
				value: data.canonical as string,
			});
		}

		// Viewport
		if (!data.viewport) {
			checks.push({
				category: "Meta",
				name: "Viewport",
				status: "fail",
				recommendation:
					'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
			});
		} else {
			checks.push({
				category: "Meta",
				name: "Viewport",
				status: "pass",
				value: data.viewport as string,
			});
		}

		// Language
		if (!data.lang) {
			checks.push({
				category: "Technical",
				name: "Language",
				status: "warn",
				recommendation: 'Add lang attribute: <html lang="en">',
			});
		} else {
			checks.push({
				category: "Technical",
				name: "Language",
				status: "pass",
				value: data.lang as string,
			});
		}

		// HTTPS
		checks.push({
			category: "Technical",
			name: "HTTPS",
			status: data.isHttps ? "pass" : "warn",
			recommendation: data.isHttps
				? undefined
				: "Serve over HTTPS for security and SEO",
		});

		// Headings
		const headings = data.headings as { level: number; text: string }[];
		const h1s = headings.filter((h) => h.level === 1);
		if (h1s.length === 0) {
			checks.push({
				category: "Headings",
				name: "H1",
				status: "fail",
				recommendation: "Add exactly one <h1> element",
			});
		} else if (h1s.length > 1) {
			checks.push({
				category: "Headings",
				name: "H1",
				status: "warn",
				value: `${h1s.length} H1 tags found`,
				recommendation: "Use only one <h1> per page",
			});
		} else {
			checks.push({
				category: "Headings",
				name: "H1",
				status: "pass",
				value: `"${h1s[0].text}"`,
			});
		}

		// Heading hierarchy — headings are already in DOM order
		let hasSkip = false;
		for (let i = 1; i < headings.length; i++) {
			if (headings[i].level > headings[i - 1].level + 1) {
				hasSkip = true;
				break;
			}
		}
		checks.push({
			category: "Headings",
			name: "Hierarchy",
			status: hasSkip ? "warn" : "pass",
			value: `${headings.length} headings`,
			recommendation: hasSkip
				? "Heading levels skip (e.g., H1 → H3). Use sequential levels."
				: undefined,
		});

		// Images
		const imgs = data.images as {
			total: number;
			missingAlt: number;
			missingAltSources: string[];
			missingDimensions: number;
		};
		if (imgs.total > 0) {
			if (imgs.missingAlt > 0) {
				checks.push({
					category: "Images",
					name: "Alt text",
					status: "fail",
					value: `${imgs.missingAlt}/${imgs.total} missing alt`,
					recommendation: `Add alt text to ${imgs.missingAlt} images`,
				});
			} else {
				checks.push({
					category: "Images",
					name: "Alt text",
					status: "pass",
					value: `${imgs.total} images, all have alt`,
				});
			}

			if (imgs.missingDimensions > 0) {
				checks.push({
					category: "Images",
					name: "Dimensions",
					status: "warn",
					value: `${imgs.missingDimensions} missing width/height`,
					recommendation: "Add width and height attributes to prevent CLS",
				});
			}
		}

		// Links
		const links = data.links as {
			internal: number;
			external: number;
			genericTexts: string[];
		};
		checks.push({
			category: "Links",
			name: "Internal links",
			status: "pass",
			value: `${links.internal} internal, ${links.external} external`,
		});
		if (links.genericTexts.length > 0) {
			checks.push({
				category: "Links",
				name: "Link text quality",
				status: "warn",
				value: `${links.genericTexts.length} generic links`,
				recommendation:
					'Avoid generic link text like "click here" or "read more"',
			});
		}

		// Structured data
		const structured = data.structuredData as unknown[];
		if (structured.length > 0) {
			checks.push({
				category: "Structured Data",
				name: "JSON-LD",
				status: "pass",
				value: `${structured.length} schema(s) found`,
			});
		} else {
			checks.push({
				category: "Structured Data",
				name: "JSON-LD",
				status: "warn",
				recommendation: "Add structured data (JSON-LD) for rich search results",
			});
		}

		// Open Graph
		const og = data.openGraph as Record<string, string>;
		const ogKeys = Object.keys(og);
		if (ogKeys.length >= 4) {
			checks.push({
				category: "Social",
				name: "Open Graph",
				status: "pass",
				value: ogKeys.join(", "),
			});
		} else if (ogKeys.length > 0) {
			checks.push({
				category: "Social",
				name: "Open Graph",
				status: "warn",
				value: ogKeys.join(", "),
				recommendation:
					"Add og:title, og:description, og:image, og:url for complete social sharing",
			});
		} else {
			checks.push({
				category: "Social",
				name: "Open Graph",
				status: "warn",
				recommendation: "Add Open Graph meta tags for social sharing",
			});
		}

		// Score
		let score = 0;
		let maxScore = 0;
		for (const check of checks) {
			maxScore += 2;
			if (check.status === "pass") score += 2;
			else if (check.status === "warn") score += 1;
		}
		const normalizedScore =
			maxScore > 0 ? Math.round((score / maxScore) * 100) : 100;

		const report: SeoReport = {
			url: pageUrl,
			checks,
			score: normalizedScore,
		};

		if (jsonOutput) {
			return { ok: true, data: JSON.stringify(report) };
		}

		return { ok: true, data: formatSeoReport(report) };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `SEO audit failed: ${message}` };
	}
}

function formatSeoReport(report: SeoReport): string {
	const lines: string[] = [];
	lines.push(`SEO Audit: ${report.url}`);
	lines.push("=".repeat(50));
	lines.push("");

	// Group by category
	const categories = new Map<string, SeoCheck[]>();
	for (const check of report.checks) {
		const list = categories.get(check.category) ?? [];
		list.push(check);
		categories.set(check.category, list);
	}

	for (const [cat, checks] of categories) {
		lines.push(cat);
		for (const check of checks) {
			const icon =
				check.status === "pass"
					? "PASS"
					: check.status === "warn"
						? "WARN"
						: "FAIL";
			let line = `  [${icon}] ${check.name}`;
			if (check.value) line += ` — ${check.value}`;
			lines.push(line);
			if (check.recommendation) {
				lines.push(`         ${check.recommendation}`);
			}
		}
		lines.push("");
	}

	lines.push(`Score: ${report.score}/100`);
	return lines.join("\n");
}
