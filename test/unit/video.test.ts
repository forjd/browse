import { describe, expect, mock, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createVideoState,
	handleVideo,
	listVideoFiles,
	type PageHolder,
	type VideoState,
} from "../../src/commands/video.ts";

/**
 * Build a mock BrowserContext + Browser for video tests.
 *
 * The mock browser creates contexts that behave as follows:
 * - newContext() returns a mock context with newPage(), close(), addCookies()
 * - newPage() returns a mock page with video(), goto(), url(), viewportSize()
 * - video() returns a mock video with saveAs(), path()
 */
function mockSetup(opts?: {
	contextFail?: boolean;
	gotoFail?: boolean;
	closeFail?: boolean;
	saveAsFail?: boolean;
	noBrowser?: boolean;
	videoPath?: string;
}) {
	const videoPath = opts?.videoPath ?? "/tmp/fake-video.webm";

	const mockVideo = {
		saveAs: opts?.saveAsFail
			? mock(() => Promise.reject(new Error("saveAs failed")))
			: mock((path: string) => {
					// Simulate writing the video file
					mkdirSync(join(path, ".."), { recursive: true });
					writeFileSync(path, "fake-video-data");
					return Promise.resolve();
				}),
		path: mock(() => Promise.resolve(videoPath)),
	};

	const recordingPage = {
		video: () => mockVideo,
		goto: opts?.gotoFail
			? mock(() => Promise.reject(new Error("goto failed")))
			: mock(() => Promise.resolve()),
		url: () => "about:blank",
		viewportSize: () => ({ width: 1280, height: 720 }),
	};

	const recordingContext = {
		newPage: mock(() => Promise.resolve(recordingPage)),
		close: opts?.closeFail
			? mock(() => Promise.reject(new Error("close failed")))
			: mock(() => Promise.resolve()),
		addCookies: mock(() => Promise.resolve()),
	};

	const mockBrowser = {
		newContext: opts?.contextFail
			? mock(() => Promise.reject(new Error("context creation failed")))
			: mock(() => Promise.resolve(recordingContext)),
	};

	const currentPage = {
		url: () => "https://example.com",
		viewportSize: () => ({ width: 1440, height: 900 }),
		video: () => null,
	};

	const context = {
		browser: () => (opts?.noBrowser ? null : mockBrowser),
		cookies: mock(() => Promise.resolve([{ name: "sid", value: "abc" }])),
	} as never;

	const tabState: PageHolder = { page: currentPage as never };

	return {
		context,
		tabState,
		currentPage,
		recordingPage,
		recordingContext,
		mockBrowser,
		mockVideo,
	};
}

describe("video subcommand routing", () => {
	test("returns usage when no args", async () => {
		const { context, tabState } = mockSetup();
		const result = await handleVideo(context, createVideoState(), tabState, []);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage:");
			expect(result.error).toContain("video start");
			expect(result.error).toContain("video stop");
		}
	});

	test("returns error for unknown subcommand", async () => {
		const { context, tabState } = mockSetup();
		const result = await handleVideo(context, createVideoState(), tabState, [
			"foobar",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown video subcommand");
			expect(result.error).toContain("start");
			expect(result.error).toContain("stop");
		}
	});
});

describe("video start", () => {
	test("starts recording with default settings", async () => {
		const { context, tabState, mockBrowser, recordingPage } = mockSetup();
		const state = createVideoState();

		const result = await handleVideo(context, state, tabState, ["start"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Video recording started");
			expect(result.data).toContain("1440x900"); // current viewport
		}

		expect(state.recording).toBe(true);
		expect(state.startedAt).toBeDefined();
		expect(state.recordingContext).toBeDefined();
		expect(state.originalPage).toBeDefined();
		// tabState.page should now be the recording page
		expect(tabState.page).toBe(recordingPage);
		// browser.newContext should have been called with recordVideo
		expect(mockBrowser.newContext).toHaveBeenCalledTimes(1);
	});

	test("starts recording with custom size", async () => {
		const { context, tabState } = mockSetup();
		const state = createVideoState();

		const result = await handleVideo(context, state, tabState, [
			"start",
			"--size",
			"640x480",
		]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("640x480");
		}
	});

	test("returns error for invalid size format", async () => {
		const { context, tabState } = mockSetup();
		const result = await handleVideo(context, createVideoState(), tabState, [
			"start",
			"--size",
			"invalid",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Invalid size format");
		}
	});

	test("returns error if already recording", async () => {
		const { context, tabState } = mockSetup();
		const state = createVideoState();
		state.recording = true;

		const result = await handleVideo(context, state, tabState, ["start"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("already in progress");
		}
	});

	test("returns error if browser not available", async () => {
		const { context, tabState } = mockSetup({ noBrowser: true });
		const result = await handleVideo(context, createVideoState(), tabState, [
			"start",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Browser instance not available");
		}
	});

	test("returns error if context creation fails", async () => {
		const { context, tabState } = mockSetup({ contextFail: true });
		const result = await handleVideo(context, createVideoState(), tabState, [
			"start",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Failed to start video recording");
		}
	});

	test("copies cookies to recording context", async () => {
		const { context, tabState, recordingContext } = mockSetup();
		const state = createVideoState();

		await handleVideo(context, state, tabState, ["start"]);

		expect(recordingContext.addCookies).toHaveBeenCalledTimes(1);
		expect(recordingContext.addCookies).toHaveBeenCalledWith([
			{ name: "sid", value: "abc" },
		]);
	});

	test("navigates recording page to current URL", async () => {
		const { context, tabState, recordingPage } = mockSetup();
		const state = createVideoState();

		await handleVideo(context, state, tabState, ["start"]);

		expect(recordingPage.goto).toHaveBeenCalledTimes(1);
		expect(recordingPage.goto).toHaveBeenCalledWith("https://example.com", {
			waitUntil: "domcontentloaded",
		});
	});

	test("calls attachListeners on recording page", async () => {
		const { context, tabState, recordingPage } = mockSetup();
		const state = createVideoState();
		const attachListeners = mock(() => {});

		await handleVideo(context, state, tabState, ["start"], {
			attachListeners,
		});

		expect(attachListeners).toHaveBeenCalledTimes(1);
		expect(attachListeners).toHaveBeenCalledWith(recordingPage);
	});
});

describe("video stop", () => {
	test("returns error if not recording", async () => {
		const { context, tabState } = mockSetup();
		const result = await handleVideo(context, createVideoState(), tabState, [
			"stop",
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("No video recording in progress");
		}
	});

	test("stops recording and saves video with custom path", async () => {
		const {
			context,
			tabState,
			currentPage,
			recordingPage,
			recordingContext,
			mockVideo,
		} = mockSetup();

		// Simulate state after video start: tabState.page is the recording page
		tabState.page = recordingPage as never;

		const state: VideoState = {
			recording: true,
			startedAt: Date.now() - 5000,
			recordingContext: recordingContext as never,
			originalPage: currentPage as never,
			videoDir: join(tmpdir(), `browse-video-test-${Date.now()}`),
		};
		if (state.videoDir) mkdirSync(state.videoDir, { recursive: true });

		const outDir = join(tmpdir(), `browse-video-out-${Date.now()}`);
		const outPath = join(outDir, "test-video.webm");

		const result = await handleVideo(context, state, tabState, [
			"stop",
			"--out",
			outPath,
		]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Video saved to");
			expect(result.data).toContain(outPath);
		}

		// Recording context should have been closed
		expect(recordingContext.close).toHaveBeenCalledTimes(1);
		// Video should have been saved
		expect(mockVideo.saveAs).toHaveBeenCalledWith(outPath);
		// Original page should be restored
		expect(tabState.page).toBe(currentPage);
		// State should be reset
		expect(state.recording).toBe(false);
		expect(state.recordingContext).toBeUndefined();
		expect(state.originalPage).toBeUndefined();

		// Clean up
		rmSync(outDir, { recursive: true, force: true });
	});

	test("restores original page even on error", async () => {
		const { context, tabState, currentPage, recordingPage, recordingContext } =
			mockSetup({
				closeFail: true,
			});

		// Simulate state after video start
		tabState.page = recordingPage as never;

		const state: VideoState = {
			recording: true,
			startedAt: Date.now(),
			recordingContext: recordingContext as never,
			originalPage: currentPage as never,
			videoDir: join(tmpdir(), `browse-video-err-${Date.now()}`),
		};
		if (state.videoDir) mkdirSync(state.videoDir, { recursive: true });

		const result = await handleVideo(context, state, tabState, ["stop"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Failed to stop video recording");
		}

		// Original page should still be restored on the tabState
		// (the function catches the error after page restore)
		expect(tabState.page).toBe(currentPage);
	});

	test("stop applies retention cleanup after saving", async () => {
		const { context, tabState, currentPage, recordingPage, recordingContext } =
			mockSetup();
		const videosDir = join(tmpdir(), `browse-videos-retention-${Date.now()}`);
		mkdirSync(videosDir, { recursive: true });
		const oldPath = join(videosDir, "old-video.webm");
		writeFileSync(oldPath, "old-video");
		const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
		utimesSync(oldPath, oldTime, oldTime);

		tabState.page = recordingPage as never;

		const state: VideoState = {
			recording: true,
			startedAt: Date.now() - 5000,
			recordingContext: recordingContext as never,
			originalPage: currentPage as never,
			videoDir: join(tmpdir(), `browse-video-test-${Date.now()}`),
		};
		if (state.videoDir) mkdirSync(state.videoDir, { recursive: true });

		const outPath = join(videosDir, "new-video.webm");
		const result = await handleVideo(
			context,
			state,
			tabState,
			["stop", "--out", outPath],
			{
				videosDir,
				retention: "1h",
			},
		);

		expect(result.ok).toBe(true);
		expect(existsSync(outPath)).toBe(true);
		expect(existsSync(oldPath)).toBe(false);

		rmSync(videosDir, { recursive: true, force: true });
	});
});

describe("video status", () => {
	test("reports no recording active", async () => {
		const { context, tabState } = mockSetup();
		const result = await handleVideo(context, createVideoState(), tabState, [
			"status",
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("No video recording active");
		}
	});

	test("reports recording in progress with elapsed time", async () => {
		const { context, tabState } = mockSetup();
		const state = createVideoState();
		state.recording = true;
		state.startedAt = Date.now() - 10_000;

		const result = await handleVideo(context, state, tabState, ["status"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Video recording in progress");
			expect(result.data).toMatch(/\d+s elapsed/);
		}
	});
});

describe("video list", () => {
	test("handles empty or missing videos directory", async () => {
		const { context, tabState } = mockSetup();
		const result = await handleVideo(context, createVideoState(), tabState, [
			"list",
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			// Either "No videos found" or lists videos from user's machine
			expect(typeof result.data).toBe("string");
		}
	});
});

describe("video clean", () => {
	test("supports dry-run cleanup for old videos", async () => {
		const videosDir = join(tmpdir(), `browse-videos-clean-${Date.now()}`);
		mkdirSync(videosDir, { recursive: true });
		const oldPath = join(videosDir, "old-video.webm");
		const newPath = join(videosDir, "new-video.webm");
		writeFileSync(oldPath, "old-video");
		writeFileSync(newPath, "new-video");
		const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
		utimesSync(oldPath, oldTime, oldTime);

		const { context, tabState } = mockSetup();
		const result = await handleVideo(
			context,
			createVideoState(),
			tabState,
			["clean", "--older-than", "1h", "--dry-run"],
			{
				videosDir,
			},
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Would delete 1 video");
			expect(result.data).toContain("old-video.webm");
		}
		expect(existsSync(oldPath)).toBe(true);
		expect(existsSync(newPath)).toBe(true);

		rmSync(videosDir, { recursive: true, force: true });
	});
});

describe("listVideoFiles", () => {
	test("returns an array", () => {
		const files = listVideoFiles();
		expect(Array.isArray(files)).toBe(true);
	});

	test("each entry has required fields", () => {
		const files = listVideoFiles();
		for (const f of files) {
			expect(typeof f.name).toBe("string");
			expect(typeof f.path).toBe("string");
			expect(f.mtime).toBeInstanceOf(Date);
			expect(typeof f.sizeBytes).toBe("number");
		}
	});
});
