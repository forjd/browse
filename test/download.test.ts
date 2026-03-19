import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleDownload } from "../src/commands/download.ts";

/** Create a mock Playwright Download object */
function mockDownload(overrides: Record<string, unknown> = {}) {
	return {
		suggestedFilename: mock(() => "report.pdf"),
		failure: mock(() => Promise.resolve(null)),
		url: mock(() => "https://example.com/report.pdf"),
		path: mock(() => Promise.resolve("/tmp/download/report.pdf")),
		saveAs: mock(() => Promise.resolve()),
		...overrides,
	};
}

/** Create a mock Page that resolves waitForEvent with the given download */
function mockPage(download: ReturnType<typeof mockDownload>) {
	return {
		waitForEvent: mock((_event: string, _opts?: unknown) =>
			Promise.resolve(download),
		),
	} as never;
}

/** Create a mock Page where waitForEvent rejects (e.g. timeout) */
function mockPageTimeout(error: Error) {
	return {
		waitForEvent: mock(() => Promise.reject(error)),
	} as never;
}

describe("handleDownload", () => {
	test("returns usage error for missing subcommand", async () => {
		const dl = mockDownload();
		const page = mockPage(dl);

		const result = await handleDownload(page, []);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("returns usage error for unknown subcommand", async () => {
		const dl = mockDownload();
		const page = mockPage(dl);

		const result = await handleDownload(page, ["unknown"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	describe("failure detection", () => {
		test("returns error when download.failure() is non-null", async () => {
			const dl = mockDownload({
				failure: mock(() => Promise.resolve("net::ERR_ABORTED")),
			});
			const page = mockPage(dl);

			const result = await handleDownload(page, ["wait"]);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toContain("net::ERR_ABORTED");
			}
		});

		test("succeeds when download.failure() is null", async () => {
			const dl = mockDownload({
				failure: mock(() => Promise.resolve(null)),
			});
			const page = mockPage(dl);

			const result = await handleDownload(page, ["wait"]);

			expect(result.ok).toBe(true);
		});
	});

	describe("metadata response", () => {
		test("includes filename in response", async () => {
			const dl = mockDownload({
				suggestedFilename: mock(() => "data.csv"),
			});
			const page = mockPage(dl);

			const result = await handleDownload(page, ["wait"]);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data).toContain("data.csv");
			}
		});

		test("includes download URL in response", async () => {
			const dl = mockDownload({
				url: mock(() => "https://cdn.example.com/file.zip"),
			});
			const page = mockPage(dl);

			const result = await handleDownload(page, ["wait"]);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data).toContain("https://cdn.example.com/file.zip");
			}
		});

		test("includes file size in response when file exists", async () => {
			const tmp = mkdtempSync(join(tmpdir(), "browse-dl-test-"));
			const filePath = join(tmp, "test-file.bin");
			writeFileSync(filePath, Buffer.alloc(2048));
			try {
				const dl = mockDownload({
					path: mock(() => Promise.resolve(filePath)),
				});
				const page = mockPage(dl);

				const result = await handleDownload(page, ["wait"]);

				expect(result.ok).toBe(true);
				if (result.ok) {
					expect(result.data).toContain("2048");
				}
			} finally {
				rmSync(tmp, { recursive: true, force: true });
			}
		});

		test("includes file size when using --save-to", async () => {
			const tmp = mkdtempSync(join(tmpdir(), "browse-dl-test-"));
			const savePath = join(tmp, "saved.pdf");
			const dl = mockDownload({
				saveAs: mock(async () => {
					writeFileSync(savePath, Buffer.alloc(4096));
				}),
			});
			const page = mockPage(dl);

			try {
				const result = await handleDownload(page, [
					"wait",
					"--save-to",
					savePath,
				]);

				expect(result.ok).toBe(true);
				if (result.ok) {
					expect(result.data).toContain("4096");
					expect(result.data).toContain(savePath);
				}
			} finally {
				rmSync(tmp, { recursive: true, force: true });
			}
		});
	});

	describe("validation flags", () => {
		test("--expect-type passes when MIME type matches", async () => {
			const tmp = mkdtempSync(join(tmpdir(), "browse-dl-test-"));
			const filePath = join(tmp, "report.pdf");
			// PDF magic bytes
			writeFileSync(filePath, Buffer.from("%PDF-1.4 content here"));
			try {
				const dl = mockDownload({
					path: mock(() => Promise.resolve(filePath)),
					suggestedFilename: mock(() => "report.pdf"),
				});
				const page = mockPage(dl);

				const result = await handleDownload(page, [
					"wait",
					"--expect-type",
					"application/pdf",
				]);

				expect(result.ok).toBe(true);
			} finally {
				rmSync(tmp, { recursive: true, force: true });
			}
		});

		test("--expect-type fails when MIME type does not match", async () => {
			const tmp = mkdtempSync(join(tmpdir(), "browse-dl-test-"));
			const filePath = join(tmp, "data.txt");
			writeFileSync(filePath, "just plain text");
			try {
				const dl = mockDownload({
					path: mock(() => Promise.resolve(filePath)),
					suggestedFilename: mock(() => "data.txt"),
				});
				const page = mockPage(dl);

				const result = await handleDownload(page, [
					"wait",
					"--expect-type",
					"application/pdf",
				]);

				expect(result.ok).toBe(false);
				if (!result.ok) {
					expect(result.error).toContain("application/pdf");
				}
			} finally {
				rmSync(tmp, { recursive: true, force: true });
			}
		});

		test("--expect-min-size passes when file is large enough", async () => {
			const tmp = mkdtempSync(join(tmpdir(), "browse-dl-test-"));
			const filePath = join(tmp, "big-file.bin");
			writeFileSync(filePath, Buffer.alloc(5000));
			try {
				const dl = mockDownload({
					path: mock(() => Promise.resolve(filePath)),
				});
				const page = mockPage(dl);

				const result = await handleDownload(page, [
					"wait",
					"--expect-min-size",
					"1024",
				]);

				expect(result.ok).toBe(true);
			} finally {
				rmSync(tmp, { recursive: true, force: true });
			}
		});

		test("--expect-min-size fails when file is too small", async () => {
			const tmp = mkdtempSync(join(tmpdir(), "browse-dl-test-"));
			const filePath = join(tmp, "tiny.bin");
			writeFileSync(filePath, Buffer.alloc(100));
			try {
				const dl = mockDownload({
					path: mock(() => Promise.resolve(filePath)),
				});
				const page = mockPage(dl);

				const result = await handleDownload(page, [
					"wait",
					"--expect-min-size",
					"1024",
				]);

				expect(result.ok).toBe(false);
				if (!result.ok) {
					expect(result.error).toContain("1024");
				}
			} finally {
				rmSync(tmp, { recursive: true, force: true });
			}
		});

		test("--expect-max-size passes when file is within limit", async () => {
			const tmp = mkdtempSync(join(tmpdir(), "browse-dl-test-"));
			const filePath = join(tmp, "ok.bin");
			writeFileSync(filePath, Buffer.alloc(500));
			try {
				const dl = mockDownload({
					path: mock(() => Promise.resolve(filePath)),
				});
				const page = mockPage(dl);

				const result = await handleDownload(page, [
					"wait",
					"--expect-max-size",
					"1024",
				]);

				expect(result.ok).toBe(true);
			} finally {
				rmSync(tmp, { recursive: true, force: true });
			}
		});

		test("--expect-max-size fails when file exceeds limit", async () => {
			const tmp = mkdtempSync(join(tmpdir(), "browse-dl-test-"));
			const filePath = join(tmp, "too-big.bin");
			writeFileSync(filePath, Buffer.alloc(5000));
			try {
				const dl = mockDownload({
					path: mock(() => Promise.resolve(filePath)),
				});
				const page = mockPage(dl);

				const result = await handleDownload(page, [
					"wait",
					"--expect-max-size",
					"1024",
				]);

				expect(result.ok).toBe(false);
				if (!result.ok) {
					expect(result.error).toContain("1024");
				}
			} finally {
				rmSync(tmp, { recursive: true, force: true });
			}
		});

		test("multiple validation flags can be combined", async () => {
			const tmp = mkdtempSync(join(tmpdir(), "browse-dl-test-"));
			const filePath = join(tmp, "report.pdf");
			writeFileSync(filePath, Buffer.from("%PDF-1.4 some content here"));
			try {
				const dl = mockDownload({
					path: mock(() => Promise.resolve(filePath)),
					suggestedFilename: mock(() => "report.pdf"),
				});
				const page = mockPage(dl);

				const result = await handleDownload(page, [
					"wait",
					"--expect-type",
					"application/pdf",
					"--expect-min-size",
					"10",
					"--expect-max-size",
					"10485760",
				]);

				expect(result.ok).toBe(true);
			} finally {
				rmSync(tmp, { recursive: true, force: true });
			}
		});
	});

	describe("timeout handling", () => {
		test("returns error on timeout", async () => {
			const page = mockPageTimeout(new Error("Timeout 5000ms exceeded."));

			const result = await handleDownload(page, ["wait"], 5000);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toContain("Timeout");
			}
		});
	});

	describe("--save-to flag", () => {
		test("calls saveAs with provided path", async () => {
			const tmp = mkdtempSync(join(tmpdir(), "browse-dl-test-"));
			const savePath = join(tmp, "output.pdf");
			const dl = mockDownload({
				saveAs: mock(async () => {
					writeFileSync(savePath, Buffer.alloc(1024));
				}),
			});
			const page = mockPage(dl);

			try {
				const result = await handleDownload(page, [
					"wait",
					"--save-to",
					savePath,
				]);

				expect(result.ok).toBe(true);
				expect(dl.saveAs).toHaveBeenCalledWith(savePath);
			} finally {
				rmSync(tmp, { recursive: true, force: true });
			}
		});
	});
});
