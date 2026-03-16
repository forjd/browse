import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Minimal PNG decoder that extracts raw RGBA pixel data.
 * Handles uncompressed (after zlib inflate) interlaced=0 PNGs with
 * color type 6 (RGBA) or color type 2 (RGB, treated as RGBA with alpha=255).
 */
function decodePng(buffer: Uint8Array): {
	width: number;
	height: number;
	data: Uint8Array;
} {
	// Validate PNG signature
	const sig = [137, 80, 78, 71, 13, 10, 26, 10];
	for (let i = 0; i < 8; i++) {
		if (buffer[i] !== sig[i]) throw new Error("Not a valid PNG file");
	}

	let width = 0;
	let height = 0;
	let bitDepth = 0;
	let colorType = 0;
	const compressedChunks: Uint8Array[] = [];

	let offset = 8;
	while (offset < buffer.length) {
		// Need at least 12 bytes for length(4) + type(4) + CRC(4)
		if (offset + 8 > buffer.length) {
			throw new Error("Invalid PNG: truncated chunk header");
		}
		// Read length as unsigned 32-bit
		const length =
			((buffer[offset] << 24) |
				(buffer[offset + 1] << 16) |
				(buffer[offset + 2] << 8) |
				buffer[offset + 3]) >>>
			0;
		const type = String.fromCharCode(
			buffer[offset + 4],
			buffer[offset + 5],
			buffer[offset + 6],
			buffer[offset + 7],
		);

		// Validate chunk data + CRC fits in buffer
		if (length > buffer.length - (offset + 12)) {
			throw new Error(
				`Invalid PNG: chunk '${type}' length ${length} exceeds available data`,
			);
		}

		if (type === "IHDR") {
			width =
				(buffer[offset + 8] << 24) |
				(buffer[offset + 9] << 16) |
				(buffer[offset + 10] << 8) |
				buffer[offset + 11];
			height =
				(buffer[offset + 12] << 24) |
				(buffer[offset + 13] << 16) |
				(buffer[offset + 14] << 8) |
				buffer[offset + 15];
			bitDepth = buffer[offset + 16];
			colorType = buffer[offset + 17];
			const compressionMethod = buffer[offset + 18];
			const filterMethod = buffer[offset + 19];
			const interlaceMethod = buffer[offset + 20];

			if (compressionMethod !== 0) {
				throw new Error(
					`Unsupported PNG compression method: ${compressionMethod} (only 0 is supported)`,
				);
			}
			if (filterMethod !== 0) {
				throw new Error(
					`Unsupported PNG filter method: ${filterMethod} (only 0 is supported)`,
				);
			}
			if (interlaceMethod !== 0) {
				throw new Error(
					`Unsupported PNG interlace method: ${interlaceMethod} (only non-interlaced is supported)`,
				);
			}
			if (bitDepth !== 8) {
				throw new Error(
					`Unsupported PNG bit depth: ${bitDepth} (only 8 is supported)`,
				);
			}
			if (colorType !== 6 && colorType !== 2) {
				throw new Error(
					`Unsupported PNG color type: ${colorType} (only 2=RGB and 6=RGBA are supported)`,
				);
			}
		} else if (type === "IDAT") {
			compressedChunks.push(buffer.slice(offset + 8, offset + 8 + length));
		} else if (type === "IEND") {
			break;
		}

		offset += 12 + length; // 4 length + 4 type + data + 4 crc
	}

	if (width === 0 || height === 0) {
		throw new Error("Invalid PNG: missing IHDR");
	}

	// Concatenate and decompress IDAT chunks
	const totalLen = compressedChunks.reduce((s, c) => s + c.length, 0);
	const compressed = new Uint8Array(totalLen);
	let pos = 0;
	for (const chunk of compressedChunks) {
		compressed.set(chunk, pos);
		pos += chunk.length;
	}

	const decompressed = Bun.inflateSync(compressed);

	// Channels per pixel
	const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 4;
	const bytesPerPixel = channels * (bitDepth / 8);
	const stride = width * bytesPerPixel + 1; // +1 for filter byte

	// Unfilter
	const pixels = new Uint8Array(width * height * 4);

	function paethPredictor(a: number, b: number, c: number): number {
		const p = a + b - c;
		const pa = Math.abs(p - a);
		const pb = Math.abs(p - b);
		const pc = Math.abs(p - c);
		if (pa <= pb && pa <= pc) return a;
		if (pb <= pc) return b;
		return c;
	}

	const prevRow = new Uint8Array(width * bytesPerPixel);
	const curRow = new Uint8Array(width * bytesPerPixel);

	for (let y = 0; y < height; y++) {
		const rowStart = y * stride;
		const filterType = decompressed[rowStart];
		const rawRow = decompressed.slice(rowStart + 1, rowStart + stride);

		// Apply filter
		for (let i = 0; i < rawRow.length; i++) {
			const raw = rawRow[i];
			const a = i >= bytesPerPixel ? curRow[i - bytesPerPixel] : 0;
			const b = prevRow[i];
			const c = i >= bytesPerPixel ? prevRow[i - bytesPerPixel] : 0;

			switch (filterType) {
				case 0:
					curRow[i] = raw;
					break;
				case 1:
					curRow[i] = (raw + a) & 0xff;
					break;
				case 2:
					curRow[i] = (raw + b) & 0xff;
					break;
				case 3:
					curRow[i] = (raw + Math.floor((a + b) / 2)) & 0xff;
					break;
				case 4:
					curRow[i] = (raw + paethPredictor(a, b, c)) & 0xff;
					break;
				default:
					curRow[i] = raw;
			}
		}

		// Copy to output as RGBA
		for (let x = 0; x < width; x++) {
			const pixelIdx = (y * width + x) * 4;
			if (channels === 4) {
				pixels[pixelIdx] = curRow[x * 4];
				pixels[pixelIdx + 1] = curRow[x * 4 + 1];
				pixels[pixelIdx + 2] = curRow[x * 4 + 2];
				pixels[pixelIdx + 3] = curRow[x * 4 + 3];
			} else {
				pixels[pixelIdx] = curRow[x * 3];
				pixels[pixelIdx + 1] = curRow[x * 3 + 1];
				pixels[pixelIdx + 2] = curRow[x * 3 + 2];
				pixels[pixelIdx + 3] = 255;
			}
		}

		prevRow.set(curRow);
	}

	return { width, height, data: pixels };
}

/**
 * Encode raw RGBA pixel data as an uncompressed (deflate store) PNG.
 */
function encodePng(
	width: number,
	height: number,
	data: Uint8Array,
): Uint8Array {
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

	// Build raw data with filter byte 0 (None) for each row
	const rawLen = height * (1 + width * 4);
	const raw = new Uint8Array(rawLen);
	for (let y = 0; y < height; y++) {
		raw[y * (1 + width * 4)] = 0; // filter: None
		raw.set(
			data.slice(y * width * 4, (y + 1) * width * 4),
			y * (1 + width * 4) + 1,
		);
	}

	const compressed = Bun.deflateSync(raw);

	// Build PNG file
	const chunks: Uint8Array[] = [];

	// Signature
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
	ihdr[9] = 6; // color type: RGBA
	ihdr[10] = 0; // compression
	ihdr[11] = 0; // filter
	ihdr[12] = 0; // interlace
	writeChunk("IHDR", ihdr);

	// IDAT
	writeChunk("IDAT", compressed);

	// IEND
	writeChunk("IEND", new Uint8Array(0));

	// Concatenate
	const totalSize = chunks.reduce((s, c) => s + c.length, 0);
	const result = new Uint8Array(totalSize);
	let off = 0;
	for (const chunk of chunks) {
		result.set(chunk, off);
		off += chunk.length;
	}

	return result;
}

export type DiffResult = {
	similarity: number;
	diffPixels: number;
	totalPixels: number;
	diffImagePath?: string;
	dimensionMismatch?: boolean;
};

/**
 * Compare two PNG screenshots and produce a diff image.
 * Returns similarity score (0-100), diff pixel count, and path to diff image.
 */
export function compareScreenshots(
	currentPath: string,
	baselinePath: string,
	threshold = 10,
): DiffResult {
	if (!existsSync(baselinePath)) {
		throw new Error(`Baseline not found: ${baselinePath}`);
	}
	if (!existsSync(currentPath)) {
		throw new Error(`Screenshot not found: ${currentPath}`);
	}

	const currentBuf = readFileSync(currentPath);
	const baselineBuf = readFileSync(baselinePath);

	const current = decodePng(new Uint8Array(currentBuf));
	const baseline = decodePng(new Uint8Array(baselineBuf));

	// Handle dimension mismatch: compare the overlapping region
	const width = Math.max(current.width, baseline.width);
	const height = Math.max(current.height, baseline.height);
	const totalPixels = width * height;
	const dimensionMismatch =
		current.width !== baseline.width || current.height !== baseline.height;

	// Build diff image
	const diffData = new Uint8Array(width * height * 4);
	let diffPixels = 0;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const diffIdx = (y * width + x) * 4;

			// Check if pixel is in both images
			const inCurrent = x < current.width && y < current.height;
			const inBaseline = x < baseline.width && y < baseline.height;

			if (!inCurrent || !inBaseline) {
				// Pixel only exists in one image — mark as diff (blue)
				diffData[diffIdx] = 0;
				diffData[diffIdx + 1] = 0;
				diffData[diffIdx + 2] = 255;
				diffData[diffIdx + 3] = 255;
				diffPixels++;
				continue;
			}

			const curIdx = (y * current.width + x) * 4;
			const baseIdx = (y * baseline.width + x) * 4;

			const dr = Math.abs(current.data[curIdx] - baseline.data[baseIdx]);
			const dg = Math.abs(
				current.data[curIdx + 1] - baseline.data[baseIdx + 1],
			);
			const db = Math.abs(
				current.data[curIdx + 2] - baseline.data[baseIdx + 2],
			);
			const da = Math.abs(
				current.data[curIdx + 3] - baseline.data[baseIdx + 3],
			);

			const maxDiff = Math.max(dr, dg, db, da);

			if (maxDiff > threshold) {
				// Different pixel — highlight in red
				diffData[diffIdx] = 255;
				diffData[diffIdx + 1] = 0;
				diffData[diffIdx + 2] = 0;
				diffData[diffIdx + 3] = 255;
				diffPixels++;
			} else {
				// Same pixel — render as dimmed grayscale
				const gray = Math.round(
					current.data[curIdx] * 0.299 +
						current.data[curIdx + 1] * 0.587 +
						current.data[curIdx + 2] * 0.114,
				);
				const dimmed = Math.round(gray * 0.3);
				diffData[diffIdx] = dimmed;
				diffData[diffIdx + 1] = dimmed;
				diffData[diffIdx + 2] = dimmed;
				diffData[diffIdx + 3] = 255;
			}
		}
	}

	const similarity =
		totalPixels > 0
			? Math.round(((totalPixels - diffPixels) / totalPixels) * 10000) / 100
			: 100;

	// Write diff image next to the current screenshot
	const diffImagePath = /\.png$/i.test(currentPath)
		? currentPath.replace(/\.png$/i, "-diff.png")
		: `${currentPath}-diff.png`;
	mkdirSync(dirname(diffImagePath), { recursive: true });
	const pngData = encodePng(width, height, diffData);
	writeFileSync(diffImagePath, pngData);

	return {
		similarity,
		diffPixels,
		totalPixels,
		diffImagePath,
		dimensionMismatch,
	};
}
