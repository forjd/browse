import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import fc from "fast-check";
import { compareScreenshots } from "../../../src/visual-diff.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-visual-diff-prop");

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

/** Build a valid PNG from raw RGBA pixel data */
function buildPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
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

	const rawLen = height * (1 + width * 4);
	const raw = new Uint8Array(rawLen);
	for (let y = 0; y < height; y++) {
		const rowOffset = y * (1 + width * 4);
		raw[rowOffset] = 0;
		raw.set(rgba.slice(y * width * 4, (y + 1) * width * 4), rowOffset + 1);
	}

	const compressed = deflateSync(raw);
	const chunks: Uint8Array[] = [];

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

	const ihdr = new Uint8Array(13);
	const ihdrDv = new DataView(ihdr.buffer);
	ihdrDv.setUint32(0, width);
	ihdrDv.setUint32(4, height);
	ihdr[8] = 8;
	ihdr[9] = 6;
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;
	writeChunk("IHDR", ihdr);
	writeChunk("IDAT", new Uint8Array(compressed));
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

/** Arbitrary for a small image dimension (keep tests fast) */
const arbDim = fc.integer({ min: 1, max: 8 });

/** Arbitrary for RGBA pixel data of given dimensions */
function arbRgba(width: number, height: number): fc.Arbitrary<Uint8Array> {
	return fc
		.array(fc.integer({ min: 0, max: 255 }), {
			minLength: width * height * 4,
			maxLength: width * height * 4,
		})
		.map((arr) => new Uint8Array(arr));
}

let testCounter = 0;

function writePngPair(
	aRgba: Uint8Array,
	aW: number,
	aH: number,
	bRgba: Uint8Array,
	bW: number,
	bH: number,
): { currentPath: string; baselinePath: string } {
	const id = testCounter++;
	const currentPath = join(TEST_DIR, `current-${id}.png`);
	const baselinePath = join(TEST_DIR, `baseline-${id}.png`);
	writeFileSync(currentPath, buildPng(aW, aH, aRgba));
	writeFileSync(baselinePath, buildPng(bW, bH, bRgba));
	return { currentPath, baselinePath };
}

describe("visual-diff — property-based tests", () => {
	test("identical images yield 100% similarity", () => {
		fc.assert(
			fc.property(arbDim, arbDim, (width, height) => {
				return fc.assert(
					fc.property(arbRgba(width, height), (rgba) => {
						const { currentPath, baselinePath } = writePngPair(
							rgba,
							width,
							height,
							rgba,
							width,
							height,
						);
						const result = compareScreenshots(currentPath, baselinePath);
						expect(result.similarity).toBe(100);
						expect(result.diffPixels).toBe(0);
					}),
					{ numRuns: 3 },
				);
			}),
			{ numRuns: 5 },
		);
	});

	test("similarity is bounded between 0 and 100", () => {
		fc.assert(
			fc.property(arbDim, arbDim, arbDim, arbDim, (w1, h1, w2, h2) => {
				return fc.assert(
					fc.property(arbRgba(w1, h1), arbRgba(w2, h2), (rgba1, rgba2) => {
						const { currentPath, baselinePath } = writePngPair(
							rgba1,
							w1,
							h1,
							rgba2,
							w2,
							h2,
						);
						const result = compareScreenshots(currentPath, baselinePath);
						expect(result.similarity).toBeGreaterThanOrEqual(0);
						expect(result.similarity).toBeLessThanOrEqual(100);
					}),
					{ numRuns: 3 },
				);
			}),
			{ numRuns: 5 },
		);
	});

	test("diffPixels never exceeds totalPixels", () => {
		fc.assert(
			fc.property(arbDim, arbDim, arbDim, arbDim, (w1, h1, w2, h2) => {
				return fc.assert(
					fc.property(arbRgba(w1, h1), arbRgba(w2, h2), (rgba1, rgba2) => {
						const { currentPath, baselinePath } = writePngPair(
							rgba1,
							w1,
							h1,
							rgba2,
							w2,
							h2,
						);
						const result = compareScreenshots(currentPath, baselinePath);
						expect(result.diffPixels).toBeLessThanOrEqual(result.totalPixels);
					}),
					{ numRuns: 3 },
				);
			}),
			{ numRuns: 5 },
		);
	});

	test("totalPixels equals max(w1,w2) * max(h1,h2)", () => {
		fc.assert(
			fc.property(arbDim, arbDim, arbDim, arbDim, (w1, h1, w2, h2) => {
				return fc.assert(
					fc.property(arbRgba(w1, h1), arbRgba(w2, h2), (rgba1, rgba2) => {
						const { currentPath, baselinePath } = writePngPair(
							rgba1,
							w1,
							h1,
							rgba2,
							w2,
							h2,
						);
						const result = compareScreenshots(currentPath, baselinePath);
						const expectedTotal = Math.max(w1, w2) * Math.max(h1, h2);
						expect(result.totalPixels).toBe(expectedTotal);
					}),
					{ numRuns: 3 },
				);
			}),
			{ numRuns: 5 },
		);
	});

	test("diff image roundtrips: output PNG can be re-decoded", () => {
		fc.assert(
			fc.property(arbDim, arbDim, (width, height) => {
				return fc.assert(
					fc.property(
						arbRgba(width, height),
						arbRgba(width, height),
						(rgba1, rgba2) => {
							const { currentPath, baselinePath } = writePngPair(
								rgba1,
								width,
								height,
								rgba2,
								width,
								height,
							);
							const result = compareScreenshots(currentPath, baselinePath);
							// The diff image should itself be a valid PNG
							const diffPath = result.diffImagePath ?? "";
							const reResult = compareScreenshots(diffPath, diffPath);
							expect(reResult.similarity).toBe(100);
						},
					),
					{ numRuns: 3 },
				);
			}),
			{ numRuns: 5 },
		);
	});

	test("dimension mismatch flag is set correctly", () => {
		fc.assert(
			fc.property(arbDim, arbDim, arbDim, arbDim, (w1, h1, w2, h2) => {
				return fc.assert(
					fc.property(arbRgba(w1, h1), arbRgba(w2, h2), (rgba1, rgba2) => {
						const { currentPath, baselinePath } = writePngPair(
							rgba1,
							w1,
							h1,
							rgba2,
							w2,
							h2,
						);
						const result = compareScreenshots(currentPath, baselinePath);
						const expected = w1 !== w2 || h1 !== h2;
						expect(result.dimensionMismatch).toBe(expected);
					}),
					{ numRuns: 3 },
				);
			}),
			{ numRuns: 5 },
		);
	});
});
