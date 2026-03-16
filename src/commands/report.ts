import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Response } from "../protocol.ts";

function parseArgs(args: string[]): {
	out?: string;
	title: string;
	screenshots: string;
	error?: string;
} {
	let out: string | undefined;
	let title = "Browse QA Report";
	let screenshots = join(homedir(), ".bun-browse", "screenshots");

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--out") {
			const next = args[i + 1];
			if (!next || next.startsWith("--")) {
				return { title, screenshots, error: "Missing value for --out." };
			}
			out = next;
			i++;
		} else if (arg === "--title") {
			const next = args[i + 1];
			if (!next || next.startsWith("--")) {
				return { title, screenshots, error: "Missing value for --title." };
			}
			title = next;
			i++;
		} else if (arg === "--screenshots") {
			const next = args[i + 1];
			if (!next || next.startsWith("--")) {
				return {
					title,
					screenshots,
					error: "Missing value for --screenshots.",
				};
			}
			screenshots = next;
			i++;
		}
	}

	return { out, title, screenshots };
}

interface ScreenshotEntry {
	name: string;
	path: string;
	mtime: Date;
	base64: string;
}

function collectScreenshots(dir: string): ScreenshotEntry[] {
	if (!existsSync(dir)) {
		return [];
	}

	const entries: ScreenshotEntry[] = [];
	const files = readdirSync(dir);

	for (const file of files) {
		if (!/\.(png|jpg|jpeg|webp)$/i.test(file)) {
			continue;
		}

		try {
			const filePath = join(dir, file);
			const stat = statSync(filePath);

			if (!stat.isFile()) {
				continue;
			}

			const ext = file.split(".").pop()?.toLowerCase() ?? "png";
			const mime =
				ext === "jpg" || ext === "jpeg"
					? "image/jpeg"
					: ext === "webp"
						? "image/webp"
						: "image/png";

			const raw = readFileSync(filePath);
			const base64 = `data:${mime};base64,${raw.toString("base64")}`;

			entries.push({
				name: file,
				path: filePath,
				mtime: stat.mtime,
				base64,
			});
		} catch {}
	}

	entries.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
	return entries;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function formatTimestamp(date: Date): string {
	return date
		.toISOString()
		.replace("T", " ")
		.replace(/\.\d+Z$/, " UTC");
}

function generateHtml(title: string, screenshots: ScreenshotEntry[]): string {
	const now = new Date();

	const screenshotCards = screenshots
		.map(
			(s) => `
      <div class="card">
        <a href="${s.base64}" target="_blank">
          <img src="${s.base64}" alt="${escapeHtml(s.name)}" loading="lazy" />
        </a>
        <div class="card-info">
          <span class="filename">${escapeHtml(s.name)}</span>
          <span class="timestamp">${formatTimestamp(s.mtime)}</span>
        </div>
      </div>`,
		)
		.join("\n");

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    min-height: 100vh;
    padding: 2rem;
  }
  header {
    max-width: 1200px;
    margin: 0 auto 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid #333;
  }
  header h1 {
    font-size: 1.75rem;
    font-weight: 600;
    color: #f0f0f0;
    margin-bottom: 0.5rem;
  }
  header .meta {
    font-size: 0.875rem;
    color: #888;
  }
  .summary {
    max-width: 1200px;
    margin: 0 auto 2rem;
    padding: 1rem 1.25rem;
    background: #16213e;
    border-radius: 8px;
    font-size: 0.9rem;
    color: #ccc;
  }
  .summary strong { color: #f0f0f0; }
  .grid {
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.5rem;
  }
  .card {
    background: #0f3460;
    border-radius: 8px;
    overflow: hidden;
    transition: transform 0.15s ease;
  }
  .card:hover { transform: translateY(-2px); }
  .card a { display: block; }
  .card img {
    width: 100%;
    height: auto;
    display: block;
    border-bottom: 1px solid #1a1a2e;
  }
  .card-info {
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .filename {
    font-size: 0.8rem;
    font-weight: 500;
    color: #e0e0e0;
    word-break: break-all;
  }
  .timestamp {
    font-size: 0.75rem;
    color: #888;
  }
  .empty {
    max-width: 1200px;
    margin: 0 auto;
    text-align: center;
    padding: 3rem;
    color: #666;
    font-size: 0.95rem;
  }
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Generated ${formatTimestamp(now)}</div>
  </header>
  <div class="summary">
    <strong>${screenshots.length}</strong> screenshot${screenshots.length === 1 ? "" : "s"} included
  </div>
  ${
		screenshots.length > 0
			? `<div class="grid">${screenshotCards}\n  </div>`
			: '<div class="empty">No screenshots found.</div>'
	}
</body>
</html>`;
}

export async function handleReport(args: string[]): Promise<Response> {
	const parsed = parseArgs(args);

	if (parsed.error) {
		return { ok: false, error: parsed.error };
	}

	if (!parsed.out) {
		return { ok: false, error: "--out <path> is required." };
	}

	const outPath = resolve(parsed.out);
	const screenshotsDir = resolve(parsed.screenshots);

	try {
		mkdirSync(dirname(outPath), { recursive: true });
		const screenshots = collectScreenshots(screenshotsDir);
		const html = generateHtml(parsed.title, screenshots);
		writeFileSync(outPath, html, "utf-8");

		return {
			ok: true,
			data: `Report written to ${outPath} (${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"})`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
