import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
	basename,
	extname,
	isAbsolute,
	relative,
	resolve,
	sep,
} from "node:path";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

type CaptureStep = {
	goto?: string;
	click?: string;
	fill?: Record<string, string>;
	wait?: { urlContains?: string; ms?: number };
	capture?: {
		filename: string;
		alt?: string;
		caption?: string;
	};
};

type DocCaptureFlow = {
	name: string;
	variables?: string[];
	steps: CaptureStep[];
};

const VALID_CAPTURE_EXTENSIONS = new Set(["", ".png"]);

export function sanitizeCaptureFilename(raw: string): string {
	const trimmed = raw.trim();
	const ext = extname(trimmed).toLowerCase();
	if (
		!trimmed ||
		isAbsolute(trimmed) ||
		trimmed.includes("/") ||
		trimmed.includes("\\") ||
		trimmed !== basename(trimmed) ||
		trimmed.includes("..") ||
		!VALID_CAPTURE_EXTENSIONS.has(ext)
	) {
		throw new Error(
			"Capture filename must be a simple filename with an optional .png extension.",
		);
	}

	const withoutExt = ext === ".png" ? trimmed.slice(0, -ext.length) : trimmed;
	const safe = withoutExt
		.replace(/[^a-zA-Z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 120);
	if (!safe) {
		throw new Error(
			"Capture filename must include at least one safe character.",
		);
	}

	return `${safe}.png`;
}

function resolveCapturePath(outDir: string, filename: string): string {
	const resolvedOutDir = resolve(outDir);
	const target = resolve(resolvedOutDir, filename);
	const rel = relative(resolvedOutDir, target);
	if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
		throw new Error("Capture filename resolved outside the output directory.");
	}
	return target;
}

export async function handleDocCapture(
	page: Page,
	args: string[],
	options?: { json?: boolean },
): Promise<Response> {
	const jsonOutput = options?.json ?? false;

	const flowIdx = args.indexOf("--flow");
	if (flowIdx === -1 || flowIdx + 1 >= args.length) {
		return {
			ok: false,
			error: `Usage: browse doc-capture --flow <flow.json> --output <dir> [--markdown <file>] [--update]

Captures screenshots from a documentation flow with optional annotations.

Flow format:
  {
    "name": "getting-started",
    "steps": [
      { "goto": "https://example.com", "capture": { "filename": "01-homepage", "alt": "Homepage" } },
      { "click": "Login", "capture": { "filename": "02-login", "alt": "Login page" } }
    ]
  }`,
		};
	}

	const flowPath = args[flowIdx + 1];
	if (!existsSync(flowPath)) {
		return { ok: false, error: `Flow file not found: ${flowPath}` };
	}

	const outIdx = args.indexOf("--output");
	const outDir =
		outIdx !== -1 && outIdx + 1 < args.length
			? args[outIdx + 1]
			: "doc-screenshots";

	const mdIdx = args.indexOf("--markdown");
	const mdPath =
		mdIdx !== -1 && mdIdx + 1 < args.length ? args[mdIdx + 1] : undefined;

	const update = args.includes("--update");

	try {
		const flow: DocCaptureFlow = JSON.parse(readFileSync(flowPath, "utf-8"));

		// Parse variables
		const vars: Record<string, string> = {};
		for (let i = 0; i < args.length; i++) {
			if (args[i] === "--var" && i + 1 < args.length) {
				const [key, ...val] = args[i + 1].split("=");
				vars[key] = val.join("=");
				i++;
			}
		}

		const resolvedOutDir = resolve(outDir);
		mkdirSync(resolvedOutDir, { recursive: true });

		const captures: {
			filename: string;
			path: string;
			alt: string;
			caption?: string;
		}[] = [];
		let updated = 0;
		let unchanged = 0;

		for (const step of flow.steps) {
			// Execute action
			if (step.goto) {
				let url = step.goto;
				for (const [k, v] of Object.entries(vars)) {
					url = url.replace(`{{${k}}}`, v);
				}
				await page.goto(url, {
					waitUntil: "domcontentloaded",
					timeout: 30_000,
				});
			}

			if (step.click) {
				await page
					.getByRole("button", { name: step.click })
					.or(page.getByRole("link", { name: step.click }))
					.first()
					.click({ timeout: 10_000 });
			}

			if (step.fill) {
				for (const [field, value] of Object.entries(step.fill)) {
					await page
						.getByRole("textbox", { name: field })
						.first()
						.fill(value, { timeout: 10_000 });
				}
			}

			if (step.wait) {
				if (step.wait.urlContains) {
					await page.waitForURL(`**/*${step.wait.urlContains}*`, {
						timeout: 10_000,
					});
				}
				const waitMs = step.wait.ms;
				if (waitMs) {
					await new Promise((r) => setTimeout(r, waitMs));
				}
			}

			// Capture screenshot
			if (step.capture) {
				const filename = sanitizeCaptureFilename(step.capture.filename);
				const screenshotPath = resolveCapturePath(resolvedOutDir, filename);

				// Check if update mode and file exists
				if (update && existsSync(screenshotPath)) {
					// Take new screenshot to temp, compare
					const tempPath = resolveCapturePath(
						resolvedOutDir,
						`.tmp-${filename}`,
					);
					await page.screenshot({ path: tempPath, fullPage: true });

					const oldBuf = readFileSync(screenshotPath);
					const newBuf = readFileSync(tempPath);

					if (Buffer.compare(oldBuf, newBuf) === 0) {
						unchanged++;
						try {
							const { unlinkSync } = await import("node:fs");
							unlinkSync(tempPath);
						} catch {
							// ignore
						}
					} else {
						const { renameSync } = await import("node:fs");
						renameSync(tempPath, screenshotPath);
						updated++;
					}
				} else {
					await page.screenshot({
						path: screenshotPath,
						fullPage: true,
					});
					updated++;
				}

				captures.push({
					filename,
					path: screenshotPath,
					alt: step.capture.alt ?? step.capture.filename,
					caption: step.capture.caption,
				});
			}
		}

		// Generate markdown if requested
		if (mdPath) {
			const mdLines: string[] = [];
			mdLines.push(`# ${flow.name}`);
			mdLines.push("");
			for (const cap of captures) {
				mdLines.push(`![${cap.alt}](${cap.path})`);
				if (cap.caption) {
					mdLines.push(`*${cap.caption}*`);
				}
				mdLines.push("");
			}
			writeFileSync(mdPath, mdLines.join("\n"));
		}

		if (jsonOutput) {
			return {
				ok: true,
				data: JSON.stringify({
					flow: flow.name,
					captures,
					updated,
					unchanged,
					markdownPath: mdPath,
				}),
			};
		}

		const lines = [`Doc Capture: ${flow.name}`];
		for (const cap of captures) {
			lines.push(`  [OK] ${cap.filename} — ${cap.alt}`);
		}
		lines.push("");
		if (update) {
			lines.push(`Updated ${updated} screenshot(s), ${unchanged} unchanged`);
		} else {
			lines.push(`Saved ${captures.length} screenshot(s) to ${resolvedOutDir}`);
		}
		if (mdPath) {
			lines.push(`Generated ${mdPath}`);
		}

		return { ok: true, data: lines.join("\n") };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			error: `Doc capture failed: ${message}`,
		};
	}
}
