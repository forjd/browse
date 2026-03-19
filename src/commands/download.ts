import { statSync } from "node:fs";
import { extname } from "node:path";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

/** Map common file extensions to MIME types */
const EXT_TO_MIME: Record<string, string> = {
	".pdf": "application/pdf",
	".zip": "application/zip",
	".gz": "application/gzip",
	".tar": "application/x-tar",
	".json": "application/json",
	".xml": "application/xml",
	".csv": "text/csv",
	".txt": "text/plain",
	".html": "text/html",
	".htm": "text/html",
	".css": "text/css",
	".js": "application/javascript",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
	".doc": "application/msword",
	".docx":
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xls": "application/vnd.ms-excel",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".pptx":
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function mimeFromFilename(filename: string): string | undefined {
	const ext = extname(filename).toLowerCase();
	return EXT_TO_MIME[ext];
}

interface DownloadFlags {
	saveTo?: string;
	expectType?: string;
	expectMinSize?: number;
	expectMaxSize?: number;
}

function parseFlags(args: string[]): DownloadFlags {
	const flags: DownloadFlags = {};

	for (let i = 1; i < args.length; i++) {
		const arg = args[i];
		const next = args[i + 1];
		if (arg === "--save-to" && next) {
			flags.saveTo = next;
			i++;
		} else if (arg === "--expect-type" && next) {
			flags.expectType = next;
			i++;
		} else if (arg === "--expect-min-size" && next) {
			flags.expectMinSize = Number(next);
			i++;
		} else if (arg === "--expect-max-size" && next) {
			flags.expectMaxSize = Number(next);
			i++;
		}
	}

	return flags;
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function handleDownload(
	page: Page,
	args: string[],
	resolvedTimeout?: number,
): Promise<Response> {
	const subcommand = args[0];

	if (subcommand !== "wait") {
		return {
			ok: false,
			error:
				"Usage: browse download wait [--save-to <path>] [--expect-type <mime>] [--expect-min-size <bytes>] [--expect-max-size <bytes>]",
		};
	}

	const flags = parseFlags(args);
	const timeoutMs = resolvedTimeout ?? 30_000;

	try {
		const download = await page.waitForEvent("download", {
			timeout: timeoutMs,
		});

		// Check for download failure
		const failure = await download.failure();
		if (failure) {
			return { ok: false, error: `Download failed: ${failure}` };
		}

		const suggestedFilename = download.suggestedFilename();
		const url: string = download.url();

		let filePath: string | null;
		if (flags.saveTo) {
			await download.saveAs(flags.saveTo);
			filePath = flags.saveTo;
		} else {
			filePath = await download.path();
		}

		// Gather file metadata
		let size: number | undefined;
		if (filePath) {
			try {
				size = statSync(filePath).size;
			} catch {
				// File may not be accessible; continue without size
			}
		}

		const mimeType = mimeFromFilename(suggestedFilename);

		// Validate against expectations
		if (flags.expectType && mimeType !== flags.expectType) {
			return {
				ok: false,
				error: `Expected type ${flags.expectType} but got ${mimeType ?? "unknown"} (filename: ${suggestedFilename})`,
			};
		}

		if (
			flags.expectMinSize != null &&
			size != null &&
			size < flags.expectMinSize
		) {
			return {
				ok: false,
				error: `File size ${formatSize(size)} (${size} bytes) is below minimum ${formatSize(flags.expectMinSize)} (${flags.expectMinSize} bytes)`,
			};
		}

		if (
			flags.expectMaxSize != null &&
			size != null &&
			size > flags.expectMaxSize
		) {
			return {
				ok: false,
				error: `File size ${formatSize(size)} (${size} bytes) exceeds maximum ${formatSize(flags.expectMaxSize)} (${flags.expectMaxSize} bytes)`,
			};
		}

		// Build response
		const location = filePath ?? "(browser default)";
		const parts = [
			`Downloaded "${suggestedFilename}" to ${location}`,
			`url: ${url}`,
		];
		if (size != null) {
			parts.push(`size: ${formatSize(size)} (${size} bytes)`);
		}
		if (mimeType) {
			parts.push(`type: ${mimeType}`);
		}

		return { ok: true, data: parts.join("\n") };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `Download failed: ${message}` };
	}
}
