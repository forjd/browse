import { afterEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	handleDocCapture,
	sanitizeCaptureFilename,
} from "../src/commands/doc-capture.ts";

const TEST_DIR = join(tmpdir(), "browse-doc-capture-test");

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

function writeFlow(name: string, flow: unknown): string {
	const dir = join(TEST_DIR, name);
	mkdirSync(dir, { recursive: true });
	const path = join(dir, "flow.json");
	writeFileSync(path, JSON.stringify(flow));
	return path;
}

function mockPage() {
	return {
		goto: mock(async () => {}),
		getByRole: mock(() => ({
			or: mock(() => ({
				first: mock(() => ({
					click: mock(async () => {}),
				})),
			})),
			first: mock(() => ({
				fill: mock(async () => {}),
			})),
		})),
		waitForURL: mock(async () => {}),
		screenshot: mock(async ({ path }: { path: string }) => {
			writeFileSync(path, "png");
		}),
	} as any;
}

describe("sanitizeCaptureFilename", () => {
	test("normalizes simple capture names to png files", () => {
		expect(sanitizeCaptureFilename("01 Homepage")).toBe("01-Homepage.png");
		expect(sanitizeCaptureFilename("hero.png")).toBe("hero.png");
	});

	test("rejects path-like capture names", () => {
		expect(() => sanitizeCaptureFilename("../../owned")).toThrow(
			"simple filename",
		);
		expect(() => sanitizeCaptureFilename("/tmp/owned.png")).toThrow(
			"simple filename",
		);
	});
});

describe("handleDocCapture", () => {
	test("writes captures inside the output directory", async () => {
		const flowPath = writeFlow("safe", {
			name: "docs",
			steps: [{ capture: { filename: "01 Homepage", alt: "Homepage" } }],
		});
		const outDir = join(TEST_DIR, "out");
		const page = mockPage();

		const response = await handleDocCapture(
			page,
			["--flow", flowPath, "--output", outDir],
			{ json: true },
		);

		expect(response.ok).toBe(true);
		if (response.ok) {
			const data = JSON.parse(response.data) as {
				captures: Array<{ filename: string; path: string }>;
			};
			expect(data.captures[0].filename).toBe("01-Homepage.png");
			expect(data.captures[0].path).toBe(resolve(outDir, "01-Homepage.png"));
			expect(existsSync(data.captures[0].path)).toBe(true);
		}
	});

	test("rejects traversal capture names before writing screenshots", async () => {
		const flowPath = writeFlow("traversal", {
			name: "docs",
			steps: [{ capture: { filename: "../../public/owned" } }],
		});
		const outDir = join(TEST_DIR, "out");
		const outsidePath = resolve(outDir, "../../public/owned.png");
		const page = mockPage();

		const response = await handleDocCapture(page, [
			"--flow",
			flowPath,
			"--output",
			outDir,
		]);

		expect(response.ok).toBe(false);
		if (!response.ok) {
			expect(response.error).toContain("simple filename");
		}
		expect(page.screenshot).not.toHaveBeenCalled();
		expect(existsSync(outsidePath)).toBe(false);
	});
});
