import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handleAuthState } from "../src/commands/auth-state.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-auth-state");

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

function mockContext(
	storageState = {
		cookies: [
			{ name: "session", value: "abc123", domain: "example.com", path: "/" },
			{ name: "csrf", value: "xyz", domain: "example.com", path: "/" },
		],
		origins: [
			{
				origin: "https://example.com",
				localStorage: [{ name: "token", value: "jwt123" }],
			},
		],
	},
) {
	return {
		storageState: mock(() => Promise.resolve(storageState)),
		addCookies: mock(() => Promise.resolve()),
	} as never;
}

function mockPage() {
	return {
		evaluate: mock(() => Promise.resolve()),
		goto: mock(() => Promise.resolve()),
		reload: mock(() => Promise.resolve()),
		url: mock(() => "https://example.com/dashboard"),
	} as never;
}

describe("auth-state command", () => {
	test("returns error when no subcommand provided", async () => {
		const res = await handleAuthState(mockContext(), mockPage(), []);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("save");
			expect(res.error).toContain("load");
		}
	});

	test("returns error for unknown subcommand", async () => {
		const res = await handleAuthState(mockContext(), mockPage(), ["delete"]);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("save");
			expect(res.error).toContain("load");
		}
	});

	describe("save", () => {
		test("returns error when no path provided", async () => {
			const res = await handleAuthState(mockContext(), mockPage(), ["save"]);
			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("path");
			}
		});

		test("saves auth state to file", async () => {
			const path = join(TEST_DIR, "auth.json");
			const ctx = mockContext();

			const res = await handleAuthState(ctx, mockPage(), ["save", path]);
			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.data).toContain(path);
				expect(res.data).toContain("2 cookies");
				expect(res.data).toContain("1 localStorage");
			}

			expect(existsSync(path)).toBe(true);
			const saved = JSON.parse(await Bun.file(path).text());
			expect(saved.cookies).toHaveLength(2);
			expect(saved.origins).toHaveLength(1);
		});

		test("creates parent directories if needed", async () => {
			const path = join(TEST_DIR, "nested", "deep", "auth.json");
			const res = await handleAuthState(mockContext(), mockPage(), [
				"save",
				path,
			]);
			expect(res.ok).toBe(true);
			expect(existsSync(path)).toBe(true);
		});

		test("reports zero counts when state is empty", async () => {
			const path = join(TEST_DIR, "empty-auth.json");
			const ctx = mockContext({ cookies: [], origins: [] });

			const res = await handleAuthState(ctx, mockPage(), ["save", path]);
			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.data).toContain("0 cookies");
				expect(res.data).toContain("0 localStorage");
			}
		});
	});

	describe("load", () => {
		test("returns error when no path provided", async () => {
			const res = await handleAuthState(mockContext(), mockPage(), ["load"]);
			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("path");
			}
		});

		test("returns error when file does not exist", async () => {
			const path = join(TEST_DIR, "nonexistent.json");
			const res = await handleAuthState(mockContext(), mockPage(), [
				"load",
				path,
			]);
			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("File not found");
				expect(res.error).toContain(path);
			}
		});

		test("returns error for invalid JSON", async () => {
			const path = join(TEST_DIR, "bad.json");
			writeFileSync(path, "not json");

			const res = await handleAuthState(mockContext(), mockPage(), [
				"load",
				path,
			]);
			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("Invalid auth state file");
				expect(res.error).toContain("malformed JSON");
			}
		});

		test("loads auth state and applies cookies", async () => {
			const path = join(TEST_DIR, "auth.json");
			const state = {
				cookies: [
					{
						name: "session",
						value: "abc123",
						domain: "example.com",
						path: "/",
					},
				],
				origins: [
					{
						origin: "https://example.com",
						localStorage: [{ name: "token", value: "jwt123" }],
					},
				],
			};
			writeFileSync(path, JSON.stringify(state));

			const ctx = mockContext();
			const page = mockPage();
			const res = await handleAuthState(ctx, page, ["load", path]);

			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.data).toContain(path);
				expect(res.data).toContain("1 cookie");
				expect(res.data).toContain("1 localStorage");
				expect(res.data).toContain("Page reloaded");
			}

			expect(ctx.addCookies).toHaveBeenCalledWith(state.cookies);
		});
	});
});
