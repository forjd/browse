import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { RingBuffer } from "../../../src/buffers.ts";

describe("RingBuffer — property-based tests", () => {
	test("never exceeds capacity", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 200 }),
				fc.array(fc.integer(), { minLength: 0, maxLength: 500 }),
				(capacity, items) => {
					const buf = new RingBuffer<number>(capacity);
					for (const item of items) buf.push(item);
					return buf.peek().length <= capacity;
				},
			),
		);
	});

	test("peek returns items in FIFO insertion order", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 100 }),
				fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
				(capacity, items) => {
					const buf = new RingBuffer<number>(capacity);
					for (const item of items) buf.push(item);

					const expected = items.slice(-capacity);
					const actual = buf.peek();
					expect(actual).toEqual(expected);
				},
			),
		);
	});

	test("drain returns same items as peek, then empties buffer", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 100 }),
				fc.array(fc.string(), { minLength: 0, maxLength: 200 }),
				(capacity, items) => {
					const buf = new RingBuffer<string>(capacity);
					for (const item of items) buf.push(item);

					const peeked = buf.peek();
					const drained = buf.drain();
					expect(drained).toEqual(peeked);
					expect(buf.peek()).toEqual([]);
				},
			),
		);
	});

	test("peek is idempotent — multiple calls return identical results", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 50 }),
				fc.array(fc.integer(), { minLength: 0, maxLength: 100 }),
				(capacity, items) => {
					const buf = new RingBuffer<number>(capacity);
					for (const item of items) buf.push(item);

					const first = buf.peek();
					const second = buf.peek();
					const third = buf.peek();
					expect(first).toEqual(second);
					expect(second).toEqual(third);
				},
			),
		);
	});

	test("filtered peek is a subset of unfiltered peek in same order", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 50 }),
				fc.array(fc.integer(), { minLength: 1, maxLength: 100 }),
				(capacity, items) => {
					const buf = new RingBuffer<number>(capacity);
					for (const item of items) buf.push(item);

					const all = buf.peek();
					const evens = buf.peek((n) => n % 2 === 0);

					// Every filtered item must appear in the full list, in order
					let idx = 0;
					for (const item of evens) {
						while (idx < all.length && all[idx] !== item) idx++;
						expect(idx).toBeLessThan(all.length);
						idx++;
					}
				},
			),
		);
	});

	test("filtered drain returns same items as filtered peek", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 50 }),
				fc.array(fc.integer(), { minLength: 0, maxLength: 100 }),
				(capacity, items) => {
					const buf1 = new RingBuffer<number>(capacity);
					const buf2 = new RingBuffer<number>(capacity);
					for (const item of items) {
						buf1.push(item);
						buf2.push(item);
					}

					const filter = (n: number) => n > 0;
					const peeked = buf1.peek(filter);
					const drained = buf2.drain(filter);
					expect(drained).toEqual(peeked);
				},
			),
		);
	});

	test("push after drain resumes correctly", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 50 }),
				fc.array(fc.integer(), { minLength: 0, maxLength: 100 }),
				fc.array(fc.integer(), { minLength: 1, maxLength: 50 }),
				(capacity, firstBatch, secondBatch) => {
					const buf = new RingBuffer<number>(capacity);
					for (const item of firstBatch) buf.push(item);
					buf.drain();

					for (const item of secondBatch) buf.push(item);
					const expected = secondBatch.slice(-capacity);
					expect(buf.peek()).toEqual(expected);
				},
			),
		);
	});

	test("clear followed by push behaves like a fresh buffer", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 50 }),
				fc.array(fc.integer(), { minLength: 0, maxLength: 100 }),
				fc.array(fc.integer(), { minLength: 0, maxLength: 50 }),
				(capacity, firstBatch, secondBatch) => {
					const buf = new RingBuffer<number>(capacity);
					for (const item of firstBatch) buf.push(item);
					buf.clear();

					const fresh = new RingBuffer<number>(capacity);
					for (const item of secondBatch) {
						buf.push(item);
						fresh.push(item);
					}

					expect(buf.peek()).toEqual(fresh.peek());
				},
			),
		);
	});
});
