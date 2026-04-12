import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("docker optimisation", () => {
	test("uses multi-stage build with runtime image", () => {
		const dockerfile = readFileSync("Dockerfile", "utf8");
		expect(dockerfile).toContain("FROM oven/bun:1 AS deps");
		expect(dockerfile).toContain("FROM deps AS build");
		expect(dockerfile).toContain("FROM mcr.microsoft.com/playwright");
	});
});
