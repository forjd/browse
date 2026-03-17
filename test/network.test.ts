import { beforeEach, describe, expect, test } from "bun:test";
import { RingBuffer } from "../src/buffers.ts";
import { handleNetwork, type NetworkEntry } from "../src/commands/network.ts";

function makeEntry(overrides: Partial<NetworkEntry> = {}): NetworkEntry {
	return {
		status: 200,
		method: "GET",
		url: "https://example.com/api/data",
		timestamp: Date.now(),
		...overrides,
	};
}

describe("network command", () => {
	let buffer: RingBuffer<NetworkEntry>;

	beforeEach(() => {
		buffer = new RingBuffer<NetworkEntry>(500);
	});

	test("returns only failed requests by default and drains", () => {
		buffer.push(makeEntry({ status: 200, url: "https://example.com/ok" }));
		buffer.push(
			makeEntry({
				status: 404,
				method: "GET",
				url: "https://example.com/missing",
			}),
		);
		buffer.push(
			makeEntry({
				status: 500,
				method: "POST",
				url: "https://example.com/error",
			}),
		);

		const res = handleNetwork(buffer, []);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("[404] GET https://example.com/missing");
			expect(res.data).toContain("[500] POST https://example.com/error");
			expect(res.data).not.toContain("[200]");
		}

		// Buffer drained
		const res2 = handleNetwork(buffer, []);
		expect(res2.ok).toBe(true);
		if (res2.ok) {
			expect(res2.data).toBe("No failed requests.");
		}
	});

	test("--all returns all requests including successes", () => {
		buffer.push(
			makeEntry({ status: 200, method: "GET", url: "https://example.com/ok" }),
		);
		buffer.push(
			makeEntry({
				status: 404,
				method: "GET",
				url: "https://example.com/missing",
			}),
		);

		const res = handleNetwork(buffer, ["--all"]);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("[200] GET https://example.com/ok");
			expect(res.data).toContain("[404] GET https://example.com/missing");
		}
	});

	test("--keep preserves buffer", () => {
		buffer.push(makeEntry({ status: 500, url: "https://example.com/err" }));

		const res1 = handleNetwork(buffer, ["--keep"]);
		expect(res1.ok).toBe(true);
		if (res1.ok) {
			expect(res1.data).toContain("[500]");
		}

		// Buffer NOT drained
		const res2 = handleNetwork(buffer, []);
		expect(res2.ok).toBe(true);
		if (res2.ok) {
			expect(res2.data).toContain("[500]");
		}
	});

	test("empty buffer with default filter returns 'No failed requests.'", () => {
		const res = handleNetwork(buffer, []);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("No failed requests.");
		}
	});

	test("empty buffer with --all returns 'No requests.'", () => {
		const res = handleNetwork(buffer, ["--all"]);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("No requests.");
		}
	});

	test("only 2xx/3xx in buffer returns 'No failed requests.'", () => {
		buffer.push(makeEntry({ status: 200 }));
		buffer.push(makeEntry({ status: 301 }));

		const res = handleNetwork(buffer, []);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("No failed requests.");
		}
	});

	test("returns JSON array when json option is true", () => {
		buffer.push(
			makeEntry({
				status: 404,
				method: "GET",
				url: "https://example.com/missing",
			}),
		);
		buffer.push(
			makeEntry({
				status: 500,
				method: "POST",
				url: "https://example.com/error",
			}),
		);

		const res = handleNetwork(buffer, [], { json: true });
		expect(res.ok).toBe(true);
		if (res.ok) {
			const parsed = JSON.parse(res.data);
			expect(Array.isArray(parsed)).toBe(true);
			expect(parsed).toHaveLength(2);
			expect(parsed[0].status).toBe(404);
			expect(parsed[0].method).toBe("GET");
			expect(parsed[0].url).toBe("https://example.com/missing");
		}
	});

	test("returns empty JSON array when no entries and json is true", () => {
		const res = handleNetwork(buffer, [], { json: true });
		expect(res.ok).toBe(true);
		if (res.ok) {
			const parsed = JSON.parse(res.data);
			expect(parsed).toEqual([]);
		}
	});

	test("JSON output respects --all flag", () => {
		buffer.push(makeEntry({ status: 200, url: "https://example.com/ok" }));
		buffer.push(makeEntry({ status: 404, url: "https://example.com/err" }));

		const res = handleNetwork(buffer, ["--all"], { json: true });
		expect(res.ok).toBe(true);
		if (res.ok) {
			const parsed = JSON.parse(res.data);
			expect(parsed).toHaveLength(2);
		}
	});

	test("formats entries as [STATUS] METHOD URL", () => {
		buffer.push(
			makeEntry({
				status: 404,
				method: "DELETE",
				url: "https://example.com/api/users/1",
			}),
		);
		const res = handleNetwork(buffer, []);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toBe("[404] DELETE https://example.com/api/users/1");
		}
	});

	test("multiple entries separated by newlines", () => {
		buffer.push(makeEntry({ status: 404, url: "https://example.com/a" }));
		buffer.push(makeEntry({ status: 500, url: "https://example.com/b" }));

		const res = handleNetwork(buffer, []);
		expect(res.ok).toBe(true);
		if (res.ok) {
			const lines = res.data.split("\n");
			expect(lines.length).toBe(2);
		}
	});
});
