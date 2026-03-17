import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { compareScreenshots } from "../../src/visual-diff.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-visual-diff");

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

/**
 * Build a minimal valid PNG from raw RGBA pixel data.
 * Uses node:zlib deflateSync which produces zlib-wrapped data (2-byte header +
 * deflate + Adler-32), matching what real-world PNG encoders (browsers,
 * Playwright, libpng) produce per the PNG specification.
 */
function buildStandardPng(
	width: number,
	height: number,
	rgba: Uint8Array,
): Uint8Array {
	// CRC-32 table
	const crcTable = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		crcTable[n] = c;
	}
	function crc32(buf: Uint8Array, start: number, len: number): number {
		let crc = 0xffffffff;
		for (let i = start; i < start + len; i++) {
			crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
		}
		return (crc ^ 0xffffffff) >>> 0;
	}

	// Raw scanlines with filter byte 0 (None) per row
	const rawLen = height * (1 + width * 4);
	const raw = new Uint8Array(rawLen);
	for (let y = 0; y < height; y++) {
		const rowOffset = y * (1 + width * 4);
		raw[rowOffset] = 0; // filter: None
		raw.set(rgba.slice(y * width * 4, (y + 1) * width * 4), rowOffset + 1);
	}

	// Compress with node:zlib (produces zlib-wrapped data per PNG spec)
	const compressed = deflateSync(raw);

	const chunks: Uint8Array[] = [];

	// PNG signature
	chunks.push(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));

	function writeChunk(type: string, data: Uint8Array): void {
		const chunk = new Uint8Array(12 + data.length);
		const dv = new DataView(chunk.buffer);
		dv.setUint32(0, data.length);
		chunk[4] = type.charCodeAt(0);
		chunk[5] = type.charCodeAt(1);
		chunk[6] = type.charCodeAt(2);
		chunk[7] = type.charCodeAt(3);
		chunk.set(data, 8);
		const crc = crc32(chunk, 4, 4 + data.length);
		dv.setUint32(8 + data.length, crc);
		chunks.push(chunk);
	}

	// IHDR
	const ihdr = new Uint8Array(13);
	const ihdrDv = new DataView(ihdr.buffer);
	ihdrDv.setUint32(0, width);
	ihdrDv.setUint32(4, height);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // colour type: RGBA
	ihdr[10] = 0; // compression
	ihdr[11] = 0; // filter
	ihdr[12] = 0; // interlace
	writeChunk("IHDR", ihdr);

	// IDAT
	writeChunk("IDAT", new Uint8Array(compressed));

	// IEND
	writeChunk("IEND", new Uint8Array(0));

	const totalSize = chunks.reduce((s, c) => s + c.length, 0);
	const result = new Uint8Array(totalSize);
	let off = 0;
	for (const chunk of chunks) {
		result.set(chunk, off);
		off += chunk.length;
	}
	return result;
}

/** Create a solid-colour 4x4 RGBA PNG */
function solidPng(r: number, g: number, b: number, a = 255): Uint8Array {
	const w = 4;
	const h = 4;
	const rgba = new Uint8Array(w * h * 4);
	for (let i = 0; i < w * h; i++) {
		rgba[i * 4] = r;
		rgba[i * 4 + 1] = g;
		rgba[i * 4 + 2] = b;
		rgba[i * 4 + 3] = a;
	}
	return buildStandardPng(w, h, rgba);
}

describe("visual-diff: PNG decoder with zlib-wrapped IDAT", () => {
	test("decodes standard zlib-wrapped PNGs without error", () => {
		const baselinePath = join(TEST_DIR, "baseline.png");
		const currentPath = join(TEST_DIR, "current.png");

		writeFileSync(baselinePath, solidPng(255, 0, 0));
		writeFileSync(currentPath, solidPng(255, 0, 0));

		const result = compareScreenshots(currentPath, baselinePath);

		expect(result.similarity).toBe(100);
		expect(result.diffPixels).toBe(0);
		expect(result.totalPixels).toBe(16);
	});

	test("detects pixel differences between two standard PNGs", () => {
		const baselinePath = join(TEST_DIR, "baseline.png");
		const currentPath = join(TEST_DIR, "current.png");

		writeFileSync(baselinePath, solidPng(255, 0, 0)); // red
		writeFileSync(currentPath, solidPng(0, 0, 255)); // blue

		const result = compareScreenshots(currentPath, baselinePath);

		expect(result.similarity).toBeLessThan(100);
		expect(result.diffPixels).toBe(16); // all pixels differ
		expect(result.diffImagePath).toBeDefined();
		expect(existsSync(result.diffImagePath!)).toBe(true);
	});

	test("produces a valid diff image that can itself be decoded", () => {
		const baselinePath = join(TEST_DIR, "baseline.png");
		const currentPath = join(TEST_DIR, "current.png");

		writeFileSync(baselinePath, solidPng(255, 0, 0));
		writeFileSync(currentPath, solidPng(0, 255, 0));

		const result = compareScreenshots(currentPath, baselinePath);

		// The diff image (produced by encodePng) should also be decodable
		const reResult = compareScreenshots(
			result.diffImagePath!,
			result.diffImagePath!,
		);
		expect(reResult.similarity).toBe(100);
	});
});
