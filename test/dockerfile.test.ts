import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("docker optimisation", () => {
	test("uses multi-stage build with runtime image", () => {
		const dockerfile = readFileSync("Dockerfile", "utf8");
		expect(dockerfile).toContain("FROM oven/bun:1 AS deps");
		expect(dockerfile).toContain("FROM deps AS build");
		expect(dockerfile).toContain("FROM mcr.microsoft.com/playwright");
	});

	test("copies only dependency and build inputs into the image", () => {
		const dockerfile = readFileSync("Dockerfile", "utf8");
		expect(dockerfile).toContain("COPY package.json bun.lock ./");
		expect(dockerfile).toContain("COPY patches ./patches");
		expect(dockerfile).toContain("COPY src ./src");
		expect(dockerfile).not.toContain("COPY . .");
	});

	test("uses a cached Bun install layer", () => {
		const dockerfile = readFileSync("Dockerfile", "utf8");
		expect(dockerfile).toContain(
			"RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile",
		);
	});

	test("keeps bulky development paths out of the Docker build context", () => {
		const dockerignore = readFileSync(".dockerignore", "utf8");
		expect(dockerignore).toContain(".git");
		expect(dockerignore).toContain(".worktrees");
		expect(dockerignore).toContain("docs");
		expect(dockerignore).toContain("test");
		expect(dockerignore).toContain("dist");
		expect(dockerignore).toContain("node_modules");
	});
});
