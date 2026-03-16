import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Response } from "../protocol.ts";

type ReplayEntry = {
	timestamp: number;
	command: string;
	args: string[];
	result: { ok: boolean; data?: string; error?: string };
	screenshotPath?: string;
	duration: number;
};

/**
 * Session replay viewer: generates an interactive HTML timeline of a session.
 *
 * The daemon records commands to a session log file. This command reads
 * that log and produces a standalone HTML page with:
 * - Timeline of commands with timestamps
 * - Screenshots embedded inline
 * - Command results (pass/fail)
 * - Filtering and navigation
 *
 * Usage:
 *   browse replay --out report.html    Generate replay HTML from recent session
 *   browse replay list                 List available session recordings
 */
export async function handleReplay(args: string[]): Promise<Response> {
	const subcommand = args[0];
	let outPath: string | undefined;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--out") {
			outPath = args[i + 1];
			i++;
		}
	}

	const replayDir = join(homedir(), ".bun-browse", "replays");
	mkdirSync(replayDir, { recursive: true });

	if (subcommand === "list") {
		return listReplays(replayDir);
	}

	// Optional label for the replay (positional arg, e.g. "browse replay my-session")
	const sessionLabel =
		subcommand && subcommand !== "--out" ? subcommand : undefined;

	const screenshotsDir = join(homedir(), ".bun-browse", "screenshots");
	const screenshots = getScreenshots(screenshotsDir);

	if (screenshots.length === 0) {
		return {
			ok: false,
			error:
				"No screenshots found. Run some browse commands first to generate session data.\nScreenshots are used to reconstruct the session timeline.",
		};
	}

	// Build replay entries from screenshots (timestamp-ordered)
	const entries: ReplayEntry[] = screenshots.map((s, _i) => ({
		timestamp: s.timestamp,
		command: "screenshot",
		args: [],
		result: { ok: true, data: s.path },
		screenshotPath: s.path,
		duration: 0,
	}));

	// Generate HTML
	const html = generateReplayHtml(entries, sessionLabel ?? "session");

	if (!outPath) {
		const pad = (n: number, len = 2) => String(n).padStart(len, "0");
		const now = new Date();
		const ts = [
			now.getFullYear(),
			pad(now.getMonth() + 1),
			pad(now.getDate()),
			"-",
			pad(now.getHours()),
			pad(now.getMinutes()),
			pad(now.getSeconds()),
		].join("");
		outPath = join(replayDir, `replay-${ts}.html`);
	}

	mkdirSync(join(outPath, ".."), { recursive: true });
	writeFileSync(outPath, html, "utf-8");

	return {
		ok: true,
		data: `Session replay generated: ${outPath}\nOpen in a browser to view the interactive timeline.\n\nContains ${entries.length} events with ${screenshots.length} screenshots.`,
	};
}

function listReplays(replayDir: string): Response {
	if (!existsSync(replayDir)) {
		return { ok: true, data: "No replay recordings found." };
	}

	const files = readdirSync(replayDir)
		.filter((f) => f.endsWith(".html"))
		.sort()
		.reverse();

	if (files.length === 0) {
		return { ok: true, data: "No replay recordings found." };
	}

	const lines = files.map((f) => `  ${join(replayDir, f)}`);
	return { ok: true, data: `Replay recordings:\n${lines.join("\n")}` };
}

type ScreenshotInfo = {
	path: string;
	filename: string;
	timestamp: number;
};

function getScreenshots(dir: string): ScreenshotInfo[] {
	if (!existsSync(dir)) return [];

	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".png"))
		.sort();

	return files.map((f) => {
		const match = f.match(
			/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})/,
		);
		let timestamp = Date.now();
		if (match) {
			timestamp = new Date(
				Number(match[1]),
				Number(match[2]) - 1,
				Number(match[3]),
				Number(match[4]),
				Number(match[5]),
				Number(match[6]),
				Number(match[7]),
			).getTime();
		}
		return {
			path: join(dir, f),
			filename: f,
			timestamp,
		};
	});
}

function generateReplayHtml(
	entries: ReplayEntry[],
	sessionName: string,
): string {
	// Embed screenshots as base64 data URIs
	const screenshotData: Record<string, string> = {};
	for (const entry of entries) {
		if (entry.screenshotPath && existsSync(entry.screenshotPath)) {
			try {
				const data = readFileSync(entry.screenshotPath).toString("base64");
				screenshotData[entry.screenshotPath] = data;
			} catch {
				// Skip unreadable screenshots
			}
		}
	}

	const entriesJson = JSON.stringify(
		entries.map((e) => ({
			...e,
			screenshotBase64: e.screenshotPath
				? screenshotData[e.screenshotPath]
				: undefined,
		})),
	);

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Browse Session Replay — ${sessionName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; }
  .header { padding: 20px 30px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; align-items: center; gap: 16px; }
  .header h1 { font-size: 20px; font-weight: 600; }
  .header .meta { color: #8b949e; font-size: 14px; }
  .container { display: flex; height: calc(100vh - 65px); }
  .timeline { width: 350px; overflow-y: auto; border-right: 1px solid #30363d; background: #0d1117; }
  .timeline-entry { padding: 12px 16px; border-bottom: 1px solid #21262d; cursor: pointer; transition: background 0.15s; }
  .timeline-entry:hover { background: #161b22; }
  .timeline-entry.active { background: #1f6feb22; border-left: 3px solid #58a6ff; }
  .timeline-entry .time { font-size: 11px; color: #8b949e; font-family: monospace; }
  .timeline-entry .cmd { font-size: 14px; font-weight: 500; margin-top: 2px; }
  .timeline-entry .status { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .timeline-entry .status.pass { background: #3fb950; }
  .timeline-entry .status.fail { background: #f85149; }
  .viewer { flex: 1; overflow: auto; padding: 24px; display: flex; flex-direction: column; align-items: center; }
  .viewer img { max-width: 100%; border: 1px solid #30363d; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
  .viewer .detail { margin-top: 16px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; width: 100%; max-width: 900px; }
  .viewer .detail pre { font-size: 13px; white-space: pre-wrap; word-break: break-all; color: #c9d1d9; }
  .controls { padding: 12px 16px; background: #161b22; border-top: 1px solid #30363d; display: flex; gap: 8px; align-items: center; }
  .controls button { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .controls button:hover { background: #30363d; }
  .controls .counter { color: #8b949e; font-size: 13px; margin-left: auto; }
  .empty { color: #8b949e; text-align: center; padding: 60px; font-size: 16px; }
</style>
</head>
<body>
<div class="header">
  <h1>Browse Session Replay</h1>
  <span class="meta">${sessionName} — ${entries.length} events</span>
</div>
<div class="container">
  <div class="timeline" id="timeline"></div>
  <div class="viewer" id="viewer">
    <div class="empty">Select an event from the timeline to view details</div>
  </div>
</div>
<div class="controls">
  <button onclick="prev()">← Prev</button>
  <button onclick="next()">Next →</button>
  <button onclick="autoPlay()">▶ Auto-play</button>
  <span class="counter" id="counter"></span>
</div>
<script>
const entries = ${entriesJson};
let current = -1;
let playing = false;
let playInterval = null;

function render() {
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = entries.map((e, i) => {
    const time = new Date(e.timestamp).toLocaleTimeString();
    const status = e.result.ok ? 'pass' : 'fail';
    const active = i === current ? 'active' : '';
    const label = e.screenshotPath ? e.screenshotPath.split('/').pop() : e.command;
    return '<div class="timeline-entry ' + active + '" onclick="select(' + i + ')">' +
      '<span class="time">' + time + '</span>' +
      '<div class="cmd"><span class="status ' + status + '"></span>' + label + '</div>' +
      '</div>';
  }).join('');

  const viewer = document.getElementById('viewer');
  const counter = document.getElementById('counter');

  if (current < 0 || current >= entries.length) {
    viewer.innerHTML = '<div class="empty">Select an event from the timeline to view details</div>';
    counter.textContent = '';
    return;
  }

  const e = entries[current];
  counter.textContent = (current + 1) + ' / ' + entries.length;

  let html = '';
  if (e.screenshotBase64) {
    html += '<img src="data:image/png;base64,' + e.screenshotBase64 + '" alt="Screenshot">';
  }
  html += '<div class="detail"><pre>' + JSON.stringify(e.result, null, 2) + '</pre></div>';
  viewer.innerHTML = html;

  // Scroll timeline entry into view
  const activeEl = timeline.querySelector('.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function select(i) { current = i; render(); }
function prev() { if (current > 0) { current--; render(); } }
function next() { if (current < entries.length - 1) { current++; render(); } }
function autoPlay() {
  if (playing) { clearInterval(playInterval); playing = false; return; }
  playing = true;
  current = 0;
  render();
  playInterval = setInterval(() => {
    if (current >= entries.length - 1) { clearInterval(playInterval); playing = false; return; }
    current++;
    render();
  }, 1500);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') prev();
  if (e.key === 'ArrowRight') next();
  if (e.key === ' ') { e.preventDefault(); autoPlay(); }
});

render();
</script>
</body>
</html>`;
}
