import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { compareScreenshots } from "../visual-diff.ts";

type VrtConfig = {
	threshold: number;
	viewports: { name: string; width: number; height: number }[];
	pages: { name: string; url: string }[];
	waitAfterNavigation?: string;
};

const DEFAULT_VRT_DIR = ".browse/vrt";
const DEFAULT_CONFIG: VrtConfig = {
	threshold: 5,
	viewports: [
		{ name: "mobile", width: 375, height: 667 },
		{ name: "desktop", width: 1440, height: 900 },
	],
	pages: [],
	waitAfterNavigation: "domcontentloaded",
};

export async function handleVrt(
	page: Page,
	args: string[],
	options?: { json?: boolean },
): Promise<Response> {
	if (args.length === 0) {
		return {
			ok: false,
			error:
				"Usage: browse vrt <init|baseline|check|update|list>\n\nSubcommands:\n  init                  Initialize VRT in project\n  baseline [--url ...]  Capture baseline screenshots\n  check [--threshold N] Compare against baselines\n  update [--all]        Accept current as new baselines\n  list                  List current baselines",
		};
	}

	const sub = args[0];
	const subArgs = args.slice(1);

	switch (sub) {
		case "init":
			return vrtInit();
		case "baseline":
			return vrtBaseline(page, subArgs);
		case "check":
			return vrtCheck(page, subArgs, options?.json ?? false);
		case "update":
			return vrtUpdate(subArgs);
		case "list":
			return vrtList();
		default:
			return {
				ok: false,
				error: `Unknown vrt subcommand: "${sub}". Use: init, baseline, check, update, list`,
			};
	}
}

function loadConfig(): VrtConfig {
	const configPath = join(DEFAULT_VRT_DIR, "config.json");
	if (existsSync(configPath)) {
		try {
			const raw = readFileSync(configPath, "utf-8");
			const parsed = JSON.parse(raw) as Partial<VrtConfig>;
			return {
				threshold: parsed.threshold ?? DEFAULT_CONFIG.threshold,
				viewports:
					parsed.viewports && parsed.viewports.length > 0
						? parsed.viewports
						: DEFAULT_CONFIG.viewports,
				pages: parsed.pages ?? DEFAULT_CONFIG.pages,
				waitAfterNavigation:
					parsed.waitAfterNavigation ?? DEFAULT_CONFIG.waitAfterNavigation,
			};
		} catch {
			return { ...DEFAULT_CONFIG };
		}
	}
	return { ...DEFAULT_CONFIG };
}

function vrtInit(): Response {
	const dirs = [
		DEFAULT_VRT_DIR,
		join(DEFAULT_VRT_DIR, "baselines"),
		join(DEFAULT_VRT_DIR, "current"),
		join(DEFAULT_VRT_DIR, "diffs"),
	];

	for (const dir of dirs) {
		mkdirSync(dir, { recursive: true });
	}

	const configPath = join(DEFAULT_VRT_DIR, "config.json");
	if (!existsSync(configPath)) {
		writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
	}

	return {
		ok: true,
		data: `VRT initialized in ${DEFAULT_VRT_DIR}/\n  baselines/  — baseline screenshots\n  current/    — current screenshots\n  diffs/      — diff images\n  config.json — VRT configuration`,
	};
}

function parseUrlArgs(args: string[]): { name: string; url: string }[] {
	const pages: { name: string; url: string }[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--url" && i + 1 < args.length) {
			const url = args[i + 1];
			// Derive a name from the URL
			try {
				const parsed = new URL(url);
				const pathName =
					parsed.pathname.replace(/\//g, "-").replace(/^-|-$/g, "") || "home";
				pages.push({ name: pathName, url });
			} catch {
				pages.push({ name: `page-${pages.length + 1}`, url });
			}
			i++;
		}
	}
	return pages;
}

async function vrtBaseline(page: Page, args: string[]): Promise<Response> {
	const config = loadConfig();
	const baselinesDir = join(DEFAULT_VRT_DIR, "baselines");
	mkdirSync(baselinesDir, { recursive: true });

	// Determine which pages to capture
	const urlPages = parseUrlArgs(args);
	const pages = urlPages.length > 0 ? urlPages : config.pages;

	if (pages.length === 0) {
		return {
			ok: false,
			error:
				"No pages configured. Use --url <url> or add pages to .browse/vrt/config.json",
		};
	}

	const captured: string[] = [];
	const waitEvent = (config.waitAfterNavigation ?? "domcontentloaded") as
		| "load"
		| "domcontentloaded"
		| "networkidle"
		| "commit";

	for (const p of pages) {
		for (const vp of config.viewports) {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await page.goto(p.url, { waitUntil: waitEvent });

			const filename = `${p.name}-${vp.name}.png`;
			const filepath = join(baselinesDir, filename);
			await page.screenshot({ path: filepath, fullPage: true });
			captured.push(filename);
		}
	}

	return {
		ok: true,
		data: `Captured ${captured.length} baseline screenshot(s):\n${captured.map((f) => `  ${f}`).join("\n")}`,
	};
}

async function vrtCheck(
	page: Page,
	args: string[],
	json: boolean,
): Promise<Response> {
	const config = loadConfig();
	const baselinesDir = join(DEFAULT_VRT_DIR, "baselines");
	const currentDir = join(DEFAULT_VRT_DIR, "current");
	const diffsDir = join(DEFAULT_VRT_DIR, "diffs");

	if (!existsSync(baselinesDir)) {
		return {
			ok: false,
			error: "No baselines found. Run 'browse vrt baseline' first.",
		};
	}

	mkdirSync(currentDir, { recursive: true });
	mkdirSync(diffsDir, { recursive: true });

	// Parse --threshold
	let threshold = config.threshold;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--threshold" && i + 1 < args.length) {
			threshold = Number.parseInt(args[i + 1], 10);
			if (Number.isNaN(threshold)) threshold = config.threshold;
			i++;
		}
	}

	// List baseline files
	const baselineFiles = readdirSync(baselinesDir).filter((f) =>
		f.endsWith(".png"),
	);
	if (baselineFiles.length === 0) {
		return {
			ok: false,
			error: "No baseline screenshots found in baselines/ directory.",
		};
	}

	// Determine pages from config for navigation
	const configPages = config.pages;
	const waitEvent = (config.waitAfterNavigation ?? "domcontentloaded") as
		| "load"
		| "domcontentloaded"
		| "networkidle"
		| "commit";

	const results: {
		name: string;
		pass: boolean;
		similarity: number;
		diffPixels: number;
		totalPixels: number;
		diffImagePath?: string;
	}[] = [];

	for (const baselineFile of baselineFiles) {
		const nameWithoutExt = baselineFile.replace(/\.png$/, "");

		// Try to find matching page and viewport from config
		let navigated = false;
		for (const p of configPages) {
			for (const vp of config.viewports) {
				if (`${p.name}-${vp.name}` === nameWithoutExt) {
					await page.setViewportSize({
						width: vp.width,
						height: vp.height,
					});
					await page.goto(p.url, { waitUntil: waitEvent });
					navigated = true;
					break;
				}
			}
			if (navigated) break;
		}

		// Capture current screenshot
		const currentPath = join(currentDir, baselineFile);
		await page.screenshot({ path: currentPath, fullPage: true });

		// Compare
		const baselinePath = join(baselinesDir, baselineFile);
		const diffResult = compareScreenshots(currentPath, baselinePath, threshold);

		// Copy diff image to diffs dir if it was generated
		const diffDstPath = join(
			diffsDir,
			baselineFile.replace(/\.png$/, "-diff.png"),
		);
		if (diffResult.diffImagePath && existsSync(diffResult.diffImagePath)) {
			copyFileSync(diffResult.diffImagePath, diffDstPath);
		}

		const pass = diffResult.similarity >= 100 - threshold;
		results.push({
			name: nameWithoutExt,
			pass,
			similarity: diffResult.similarity,
			diffPixels: diffResult.diffPixels,
			totalPixels: diffResult.totalPixels,
			diffImagePath: diffDstPath,
		});
	}

	const allPass = results.every((r) => r.pass);
	const passCount = results.filter((r) => r.pass).length;
	const failCount = results.filter((r) => !r.pass).length;

	if (json) {
		return {
			ok: allPass,
			...(allPass
				? {
						data: JSON.stringify(
							{ pass: allPass, passCount, failCount, results },
							null,
							2,
						),
					}
				: {
						error: JSON.stringify(
							{ pass: allPass, passCount, failCount, results },
							null,
							2,
						),
					}),
		} as Response;
	}

	const lines: string[] = [];
	lines.push(
		`VRT Check: ${allPass ? "PASS" : "FAIL"} (${passCount}/${results.length} passed)`,
	);
	lines.push("");

	for (const r of results) {
		const icon = r.pass ? "PASS" : "FAIL";
		lines.push(
			`  [${icon}] ${r.name}: ${r.similarity}% similar (${r.diffPixels} diff pixels)`,
		);
	}

	if (!allPass) {
		lines.push("");
		lines.push("Diff images saved to .browse/vrt/diffs/");
		lines.push(
			"Run 'browse vrt update --all' to accept current as new baselines.",
		);
	}

	if (allPass) {
		return { ok: true, data: lines.join("\n") };
	}
	return { ok: false, error: lines.join("\n") };
}

function vrtUpdate(args: string[]): Response {
	const currentDir = join(DEFAULT_VRT_DIR, "current");
	const baselinesDir = join(DEFAULT_VRT_DIR, "baselines");

	if (!existsSync(currentDir)) {
		return {
			ok: false,
			error: "No current screenshots found. Run 'browse vrt check' first.",
		};
	}

	mkdirSync(baselinesDir, { recursive: true });

	const updateAll = args.includes("--all");
	const onlyNames: string[] = [];

	// Parse --only flag
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--only" && i + 1 < args.length) {
			// Collect all following args until next flag
			for (let j = i + 1; j < args.length; j++) {
				if (args[j].startsWith("--")) break;
				onlyNames.push(args[j]);
			}
		}
	}

	if (!updateAll && onlyNames.length === 0) {
		return {
			ok: false,
			error:
				"Specify --all to update all baselines, or --only <names> for specific ones.",
		};
	}

	const currentFiles = readdirSync(currentDir).filter((f) =>
		f.endsWith(".png"),
	);

	if (currentFiles.length === 0) {
		return {
			ok: false,
			error: "No current screenshots to update from.",
		};
	}

	const updated: string[] = [];

	for (const file of currentFiles) {
		const nameWithoutExt = file.replace(/\.png$/, "");
		if (
			updateAll ||
			onlyNames.includes(nameWithoutExt) ||
			onlyNames.includes(file)
		) {
			copyFileSync(join(currentDir, file), join(baselinesDir, file));
			updated.push(file);
		}
	}

	if (updated.length === 0) {
		return {
			ok: false,
			error: `No matching screenshots found for: ${onlyNames.join(", ")}`,
		};
	}

	return {
		ok: true,
		data: `Updated ${updated.length} baseline(s):\n${updated.map((f) => `  ${f}`).join("\n")}`,
	};
}

function vrtList(): Response {
	const baselinesDir = join(DEFAULT_VRT_DIR, "baselines");

	if (!existsSync(baselinesDir)) {
		return {
			ok: true,
			data: "No baselines directory found. Run 'browse vrt init' first.",
		};
	}

	const files = readdirSync(baselinesDir).filter((f) => f.endsWith(".png"));

	if (files.length === 0) {
		return { ok: true, data: "No baseline screenshots found." };
	}

	const lines: string[] = [`${files.length} baseline(s):`, ""];

	for (const file of files) {
		const filepath = join(baselinesDir, file);
		const stats = statSync(filepath);
		const sizeKb = (stats.size / 1024).toFixed(1);
		lines.push(`  ${file}  (${sizeKb} KB)`);
	}

	return { ok: true, data: lines.join("\n") };
}
