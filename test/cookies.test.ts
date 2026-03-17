import { describe, expect, mock, test } from "bun:test";
import { handleCookies } from "../src/commands/cookies.ts";

function mockContext(
	cookies: Array<{
		name: string;
		value: string;
		domain: string;
		path: string;
		secure: boolean;
		httpOnly: boolean;
	}> = [],
) {
	return {
		cookies: mock(() => Promise.resolve(cookies)),
	} as never;
}

describe("cookies --json", () => {
	test("returns JSON array of cookies when json is true", async () => {
		const ctx = mockContext([
			{
				name: "sid",
				value: "abc123",
				domain: ".example.com",
				path: "/",
				secure: true,
				httpOnly: true,
			},
		]);

		const res = await handleCookies(ctx, [], { json: true });
		expect(res.ok).toBe(true);
		if (res.ok) {
			const parsed = JSON.parse(res.data);
			expect(Array.isArray(parsed)).toBe(true);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe("sid");
			expect(parsed[0].value).toBe("abc123");
			expect(parsed[0].domain).toBe(".example.com");
		}
	});

	test("returns empty JSON array when no cookies and json is true", async () => {
		const ctx = mockContext([]);

		const res = await handleCookies(ctx, [], { json: true });
		expect(res.ok).toBe(true);
		if (res.ok) {
			const parsed = JSON.parse(res.data);
			expect(parsed).toEqual([]);
		}
	});

	test("JSON output respects --domain filter", async () => {
		const ctx = mockContext([
			{
				name: "sid",
				value: "abc",
				domain: ".example.com",
				path: "/",
				secure: true,
				httpOnly: false,
			},
			{
				name: "other",
				value: "xyz",
				domain: ".other.com",
				path: "/",
				secure: false,
				httpOnly: false,
			},
		]);

		const res = await handleCookies(ctx, ["--domain", "example.com"], {
			json: true,
		});
		expect(res.ok).toBe(true);
		if (res.ok) {
			const parsed = JSON.parse(res.data);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe("sid");
		}
	});
});
