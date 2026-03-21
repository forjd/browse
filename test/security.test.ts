import { describe, expect, mock, test } from "bun:test";
import { RingBuffer } from "../src/buffers.ts";
import type { NetworkEntry } from "../src/commands/network.ts";
import {
	auditCookies,
	detectMixedContent,
	formatSecurityReport,
	handleSecurity,
} from "../src/commands/security.ts";

describe("auditCookies", () => {
	test("passes cookies with all flags set", () => {
		const cookies = [
			{
				name: "session",
				domain: "example.com",
				secure: true,
				httpOnly: true,
				sameSite: "Strict",
			},
		];
		const result = auditCookies(cookies, true);
		expect(result[0].issues).toHaveLength(0);
	});

	test("flags missing Secure on HTTPS", () => {
		const cookies = [
			{
				name: "token",
				domain: "example.com",
				secure: false,
				httpOnly: true,
				sameSite: "Lax",
			},
		];
		const result = auditCookies(cookies, true);
		expect(result[0].issues).toHaveLength(1);
		expect(result[0].issues[0]).toContain("Secure");
	});

	test("does not flag missing Secure on HTTP", () => {
		const cookies = [
			{
				name: "token",
				domain: "example.com",
				secure: false,
				httpOnly: true,
				sameSite: "Lax",
			},
		];
		const result = auditCookies(cookies, false);
		expect(result[0].issues).toHaveLength(0);
	});

	test("flags missing HttpOnly", () => {
		const cookies = [
			{
				name: "prefs",
				domain: "example.com",
				secure: true,
				httpOnly: false,
				sameSite: "Lax",
			},
		];
		const result = auditCookies(cookies, true);
		expect(result[0].issues.some((i) => i.includes("HttpOnly"))).toBe(true);
	});

	test("flags SameSite=None", () => {
		const cookies = [
			{
				name: "tracker",
				domain: "example.com",
				secure: true,
				httpOnly: true,
				sameSite: "None",
			},
		];
		const result = auditCookies(cookies, true);
		expect(result[0].issues.some((i) => i.includes("SameSite"))).toBe(true);
	});
});

describe("detectMixedContent", () => {
	test("detects HTTP resources on HTTPS page", () => {
		const entries: NetworkEntry[] = [
			{
				url: "http://cdn.example.com/script.js",
				method: "GET",
				status: 200,
				timestamp: Date.now(),
			},
			{
				url: "https://cdn.example.com/style.css",
				method: "GET",
				status: 200,
				timestamp: Date.now(),
			},
		];
		const result = detectMixedContent("https://example.com", entries);
		expect(result).toHaveLength(1);
		expect(result[0].url).toContain("http://");
	});

	test("returns empty on HTTP page", () => {
		const entries: NetworkEntry[] = [
			{
				url: "http://cdn.example.com/script.js",
				method: "GET",
				status: 200,
				timestamp: Date.now(),
			},
		];
		const result = detectMixedContent("http://example.com", entries);
		expect(result).toHaveLength(0);
	});

	test("returns empty when no mixed content", () => {
		const entries: NetworkEntry[] = [
			{
				url: "https://cdn.example.com/app.js",
				method: "GET",
				status: 200,
				timestamp: Date.now(),
			},
		];
		const result = detectMixedContent("https://example.com", entries);
		expect(result).toHaveLength(0);
	});
});

describe("formatSecurityReport", () => {
	test("formats report with all sections", () => {
		const report = {
			url: "https://example.com",
			headers: [
				{
					header: "strict-transport-security",
					value: "max-age=31536000",
					status: "pass" as const,
					recommendation: "",
				},
				{
					header: "x-content-type-options",
					value: null,
					status: "fail" as const,
					recommendation: "Set X-Content-Type-Options: nosniff",
				},
			],
			cookies: [
				{
					name: "session",
					domain: "example.com",
					secure: true,
					httpOnly: true,
					sameSite: "Strict",
					issues: [],
				},
			],
			mixedContent: [],
			score: { pass: 2, warn: 0, fail: 1 },
		};

		const output = formatSecurityReport(report);
		expect(output).toContain("Security Audit: https://example.com");
		expect(output).toContain("[PASS]");
		expect(output).toContain("[FAIL]");
		expect(output).toContain("strict-transport-security");
		expect(output).toContain("(missing)");
		expect(output).toContain("Mixed Content: None detected");
		expect(output).toContain("2 passed, 0 warnings, 1 failure");
	});
});

describe("handleSecurity", () => {
	test("runs security audit and returns report", async () => {
		const networkBuffer = new RingBuffer<NetworkEntry>(100);
		const page = {
			url: mock(() => "https://example.com"),
			evaluate: mock(() =>
				Promise.resolve({
					"strict-transport-security": "max-age=31536000",
					"x-content-type-options": "nosniff",
				}),
			),
		} as never;

		const context = {
			cookies: mock(() =>
				Promise.resolve([
					{
						name: "session",
						domain: "example.com",
						secure: true,
						httpOnly: true,
						sameSite: "Strict",
						path: "/",
						value: "abc",
						expires: -1,
					},
				]),
			),
		} as never;

		const result = await handleSecurity(page, [], {
			context,
			networkBuffer,
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Security Audit:");
			expect(result.data).toContain("Security Headers:");
			expect(result.data).toContain("Cookie Security:");
		}
	});

	test("handles errors gracefully", async () => {
		const networkBuffer = new RingBuffer<NetworkEntry>(100);
		const page = {
			url: mock(() => {
				throw new Error("No page loaded");
			}),
		} as never;

		const context = {} as never;

		const result = await handleSecurity(page, [], {
			context,
			networkBuffer,
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Security audit failed");
		}
	});
});
