import { describe, expect, test } from "bun:test";
import { RingBuffer } from "../src/buffers.ts";

describe("RingBuffer", () => {
	test("push and peek return items in order", () => {
		const buf = new RingBuffer<number>(5);
		buf.push(1);
		buf.push(2);
		buf.push(3);
		expect(buf.peek()).toEqual([1, 2, 3]);
	});

	test("push at capacity drops oldest item", () => {
		const buf = new RingBuffer<number>(3);
		buf.push(1);
		buf.push(2);
		buf.push(3);
		buf.push(4);
		expect(buf.peek()).toEqual([2, 3, 4]);
	});

	test("push at capacity wraps correctly over multiple cycles", () => {
		const buf = new RingBuffer<number>(2);
		buf.push(1);
		buf.push(2);
		buf.push(3);
		buf.push(4);
		buf.push(5);
		expect(buf.peek()).toEqual([4, 5]);
	});

	test("drain returns items and clears the buffer", () => {
		const buf = new RingBuffer<string>(10);
		buf.push("a");
		buf.push("b");
		expect(buf.drain()).toEqual(["a", "b"]);
		expect(buf.peek()).toEqual([]);
	});

	test("peek returns items without clearing", () => {
		const buf = new RingBuffer<string>(10);
		buf.push("a");
		buf.push("b");
		expect(buf.peek()).toEqual(["a", "b"]);
		expect(buf.peek()).toEqual(["a", "b"]);
	});

	test("drain with filter returns only matching items", () => {
		const buf = new RingBuffer<number>(10);
		buf.push(1);
		buf.push(2);
		buf.push(3);
		buf.push(4);
		const evens = buf.drain((n) => n % 2 === 0);
		expect(evens).toEqual([2, 4]);
		// drain still clears all items
		expect(buf.peek()).toEqual([]);
	});

	test("peek with filter returns only matching items without clearing", () => {
		const buf = new RingBuffer<number>(10);
		buf.push(1);
		buf.push(2);
		buf.push(3);
		const evens = buf.peek((n) => n % 2 === 0);
		expect(evens).toEqual([2]);
		// buffer unchanged
		expect(buf.peek()).toEqual([1, 2, 3]);
	});

	test("clear empties the buffer", () => {
		const buf = new RingBuffer<string>(10);
		buf.push("a");
		buf.push("b");
		buf.clear();
		expect(buf.peek()).toEqual([]);
	});

	test("defaults to capacity of 500", () => {
		const buf = new RingBuffer<number>();
		for (let i = 0; i < 510; i++) {
			buf.push(i);
		}
		const items = buf.peek();
		expect(items.length).toBe(500);
		expect(items[0]).toBe(10);
		expect(items[499]).toBe(509);
	});

	test("drain on empty buffer returns empty array", () => {
		const buf = new RingBuffer<number>(10);
		expect(buf.drain()).toEqual([]);
	});

	test("peek on empty buffer returns empty array", () => {
		const buf = new RingBuffer<number>(10);
		expect(buf.peek()).toEqual([]);
	});
});
