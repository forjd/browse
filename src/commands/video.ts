import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { BrowserContext, Page } from "playwright";
import {
	applyArtifactRetention,
	cleanArtifacts,
	formatArtifactBytes,
	listArtifactFiles,
	VIDEO_ARTIFACT_KIND,
} from "../artifacts.ts";
import type { Response } from "../protocol.ts";

export type VideoState = {
	recording: boolean;
	startedAt?: number;
	recordingContext?: BrowserContext;
	originalPage?: Page;
	videoDir?: string;
};

export function createVideoState(): VideoState {
	return { recording: false };
}

const VIDEOS_DIR = join(homedir(), ".bun-browse", "videos");

function generateDefaultVideoPath(videosDir = VIDEOS_DIR): string {
	mkdirSync(videosDir, { recursive: true });

	const now = new Date();
	const pad = (n: number, len = 2) => String(n).padStart(len, "0");
	const timestamp = [
		now.getFullYear(),
		pad(now.getMonth() + 1),
		pad(now.getDate()),
		"-",
		pad(now.getHours()),
		pad(now.getMinutes()),
		pad(now.getSeconds()),
	].join("");

	return join(videosDir, `video-${timestamp}.webm`);
}

/** List video files sorted newest-first. */
export function listVideoFiles(): {
	name: string;
	path: string;
	mtime: Date;
	sizeBytes: number;
}[] {
	return listArtifactFiles(VIDEOS_DIR, VIDEO_ARTIFACT_KIND).map((entry) => ({
		name: entry.name,
		path: entry.path,
		mtime: new Date(entry.mtimeMs),
		sizeBytes: entry.sizeBytes,
	}));
}

function parseSize(sizeStr: string): { width: number; height: number } | null {
	const match = sizeStr.match(/^(\d+)x(\d+)$/);
	if (!match?.[1] || !match[2]) return null;
	return {
		width: Number.parseInt(match[1], 10),
		height: Number.parseInt(match[2], 10),
	};
}

export type PageHolder = { page: Page };

export type VideoDeps = {
	attachListeners?: (page: Page) => void;
	stealthOpts?: { userAgent?: string };
	proxyConfig?: {
		server: string;
		bypass?: string;
		username?: string;
		password?: string;
	};
	passthroughContextOptions?: Record<string, unknown>;
	videosDir?: string;
	retention?: string;
};

export async function handleVideo(
	context: BrowserContext,
	videoState: VideoState,
	tabState: PageHolder,
	args: string[],
	deps?: VideoDeps,
): Promise<Response> {
	const videosDir = deps?.videosDir ?? VIDEOS_DIR;

	if (args.length === 0) {
		return {
			ok: false,
			error:
				"Usage: browse video start [--size <WxH>]\n       browse video stop [--out <path>]\n       browse video status\n       browse video list\n       browse video clean [--older-than <duration>] [--dry-run]",
		};
	}

	const subcommand = args[0];

	if (subcommand === "status") {
		if (videoState.recording) {
			const elapsed = videoState.startedAt
				? Math.floor((Date.now() - videoState.startedAt) / 1000)
				: 0;
			return {
				ok: true,
				data: `Video recording in progress (${elapsed}s elapsed)`,
			};
		}
		return { ok: true, data: "No video recording active." };
	}

	if (subcommand === "list") {
		const videos = listArtifactFiles(videosDir, VIDEO_ARTIFACT_KIND);
		if (videos.length === 0) {
			return { ok: true, data: "No videos found." };
		}

		const lines = videos.map(
			(v) =>
				`${v.name}  ${formatArtifactBytes(v.sizeBytes)}  ${new Date(v.mtimeMs).toISOString().replace("T", " ").slice(0, 19)}`,
		);
		return {
			ok: true,
			data: `${videos.length} video(s):\n${lines.join("\n")}`,
		};
	}

	if (subcommand === "clean") {
		return cleanArtifacts(args.slice(1), {
			dir: videosDir,
			kind: VIDEO_ARTIFACT_KIND,
		});
	}

	if (subcommand === "start") {
		if (videoState.recording) {
			return {
				ok: false,
				error:
					"Video recording already in progress. Stop it first with 'browse video stop'.",
			};
		}

		// Parse --size flag
		let size: { width: number; height: number } | undefined;
		for (let i = 1; i < args.length; i++) {
			if (args[i] === "--size" && i + 1 < args.length) {
				size = parseSize(args[i + 1]);
				if (!size) {
					return {
						ok: false,
						error: `Invalid size format: '${args[i + 1]}'. Expected WxH (e.g. 1280x720).`,
					};
				}
				break;
			}
		}

		// Default size: current viewport or 1280x720
		if (!size) {
			size = tabState.page.viewportSize() ?? { width: 1280, height: 720 };
		}

		const browser = context.browser();
		if (!browser) {
			return {
				ok: false,
				error:
					"Browser instance not available. Cannot create recording context.",
			};
		}

		// Create temp dir for Playwright's raw video output
		const videoDir = join(tmpdir(), `browse-video-${Date.now()}`);
		mkdirSync(videoDir, { recursive: true });

		let recordingContext: BrowserContext | undefined;
		try {
			const contextOpts: Record<string, unknown> = {
				...deps?.passthroughContextOptions,
				recordVideo: { dir: videoDir, size },
				viewport: size,
			};
			if (deps?.stealthOpts?.userAgent) {
				contextOpts.userAgent = deps.stealthOpts.userAgent;
			}
			if (deps?.proxyConfig) {
				contextOpts.proxy = deps.proxyConfig;
			}

			recordingContext = await browser.newContext(contextOpts);

			// Copy cookies from the current context
			try {
				const cookies = await context.cookies();
				if (cookies.length > 0) {
					await recordingContext.addCookies(cookies);
				}
			} catch {
				// Cookie copy is best-effort
			}

			const recordingPage = await recordingContext.newPage();

			// Navigate to the current URL
			const currentUrl = tabState.page.url();
			if (currentUrl && currentUrl !== "about:blank") {
				await recordingPage.goto(currentUrl, {
					waitUntil: "domcontentloaded",
				});
			}

			// Store original page and swap
			videoState.originalPage = tabState.page;
			videoState.recordingContext = recordingContext;
			videoState.videoDir = videoDir;
			videoState.recording = true;
			videoState.startedAt = Date.now();
			tabState.page = recordingPage;

			// Attach listeners for console/network capture
			if (deps?.attachListeners) {
				deps.attachListeners(recordingPage);
			}

			return {
				ok: true,
				data: `Video recording started (${size.width}x${size.height}). Use 'browse video stop --out video.webm' to save.`,
			};
		} catch (err) {
			// Close recording context if it was created
			try {
				await recordingContext?.close();
			} catch {
				// Best effort
			}
			// Clean up temp dir on failure
			try {
				rmSync(videoDir, { recursive: true, force: true });
			} catch {
				// Best effort
			}
			const message = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: `Failed to start video recording: ${message}`,
			};
		}
	}

	if (subcommand === "stop") {
		if (!videoState.recording) {
			return {
				ok: false,
				error:
					"No video recording in progress. Start one with 'browse video start'.",
			};
		}

		// Parse --out flag
		let outPath: string | undefined;
		for (let i = 1; i < args.length; i++) {
			if (args[i] === "--out" && i + 1 < args.length) {
				outPath = args[i + 1];
				break;
			}
		}

		const savePath = outPath ?? generateDefaultVideoPath(videosDir);

		// Ensure output directory exists
		try {
			mkdirSync(dirname(savePath), { recursive: true });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: `Failed to prepare output directory: ${message}`,
			};
		}

		// Capture state up-front so we can always reset it
		const recordingContext = videoState.recordingContext;
		const originalPage = videoState.originalPage;
		const videoDir = videoState.videoDir;
		const startedAt = videoState.startedAt;

		try {
			// The recording page is currently the active page
			const recordingPage = tabState.page;
			const video = recordingPage.video();

			// Restore original page before closing recording context
			if (originalPage) {
				tabState.page = originalPage;
			}

			// Close recording context — this finalises the video file
			if (recordingContext) {
				await recordingContext.close();
			}

			// Save video to desired path
			if (video) {
				await video.saveAs(savePath);
			}

			const elapsed = startedAt
				? Math.floor((Date.now() - startedAt) / 1000)
				: 0;

			// Clean up temp dir
			if (videoDir) {
				try {
					rmSync(videoDir, { recursive: true, force: true });
				} catch {
					// Best effort
				}
			}

			if (!existsSync(savePath)) {
				return {
					ok: false,
					error: `Video recording stopped but file was not created at ${savePath}`,
				};
			}

			const st = statSync(savePath);
			applyArtifactRetention(videosDir, VIDEO_ARTIFACT_KIND, deps?.retention);
			return {
				ok: true,
				data: `Video saved to ${savePath} (${elapsed}s, ${formatArtifactBytes(st.size)})`,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: `Failed to stop video recording: ${message}`,
			};
		} finally {
			// Always reset state so a new recording can be started
			videoState.recording = false;
			videoState.startedAt = undefined;
			videoState.recordingContext = undefined;
			videoState.originalPage = undefined;
			videoState.videoDir = undefined;
			// Ensure original page is restored even if close/save threw
			if (originalPage) {
				tabState.page = originalPage;
			}
		}
	}

	return {
		ok: false,
		error: `Unknown video subcommand: '${subcommand}'. Use start, stop, status, list, or clean.`,
	};
}
