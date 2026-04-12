import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Response } from "./protocol.ts";

export type FrameworkRunner = "jest" | "vitest";

const DEFAULT_OUTPUT_DIR = "tests";
const FRAMEWORK_USAGE =
	"Usage: browse framework init <vitest|jest> [--dir <path>] [--force]";

type FrameworkCommandOptions = {
	cwd?: string;
};

function buildHarnessTemplate(): string {
	return `const { spawn } = require("node:child_process");

function createBrowseHarness(options = {}) {
	const browseBin = options.bin || process.env.BROWSE_BIN || "browse";
	const baseArgs = [];

	if (options.config) {
		baseArgs.push("--config", options.config);
	}

	return {
		run(args, runOptions = {}) {
			return execBrowse(browseBin, [...baseArgs, ...args], runOptions);
		},
		async stop() {
			await this.run(["quit"], { allowFailure: true });
		},
	};
}

function execBrowse(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd || process.cwd(),
			env: { ...process.env, ...options.env },
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});

		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});

		child.on("error", reject);
		child.on("close", (code) => {
			const result = {
				code: code ?? 1,
				stdout: stdout.trimEnd(),
				stderr: stderr.trimEnd(),
			};

			if (code === 0 || options.allowFailure) {
				resolve(result);
				return;
			}

			reject(
				new Error(
					result.stderr ||
						result.stdout ||
						"browse exited with status " + (code ?? "unknown"),
				),
			);
		});
	});
}

module.exports = { createBrowseHarness };
`;
}

function buildFrameworkTestTemplate(runner: FrameworkRunner): string {
	if (runner === "vitest") {
		return `const { afterAll, beforeAll, describe, expect, test } = require("vitest");
const { createBrowseHarness } = require("./browse-harness.cjs");

const browse = createBrowseHarness();

beforeAll(async () => {
	await browse.run(["ping"]);
});

afterAll(async () => {
	await browse.stop();
});

describe("Browse smoke tests", () => {
	test("loads the homepage", async () => {
		const result = await browse.run(["goto", "https://example.com"]);
		expect(result.stdout).toContain("Example Domain");
	});
});
`;
	}

	return `const { createBrowseHarness } = require("./browse-harness.cjs");

const browse = createBrowseHarness();

beforeAll(async () => {
	await browse.run(["ping"]);
});

afterAll(async () => {
	await browse.stop();
});

test("loads the homepage", async () => {
	const result = await browse.run(["goto", "https://example.com"]);
	expect(result.stdout).toContain("Example Domain");
});
`;
}

function parseFrameworkArgs(args: string[]): {
	runner?: FrameworkRunner;
	dir?: string;
	force: boolean;
	error?: string;
} {
	if (args[0] !== "init") {
		return { force: false, error: FRAMEWORK_USAGE };
	}

	const runner = args[1];
	if (runner !== "vitest" && runner !== "jest") {
		return { force: false, error: FRAMEWORK_USAGE };
	}

	let dir = DEFAULT_OUTPUT_DIR;
	let force = false;

	for (let i = 2; i < args.length; i++) {
		if (args[i] === "--force") {
			force = true;
			continue;
		}

		if (args[i] === "--dir") {
			const value = args[i + 1];
			if (!value || value.startsWith("--")) {
				return { force, error: FRAMEWORK_USAGE };
			}
			dir = value;
			i++;
			continue;
		}

		return { force, error: FRAMEWORK_USAGE };
	}

	return { runner, dir, force };
}

export async function handleFrameworkCommand(
	args: string[],
	options: FrameworkCommandOptions = {},
): Promise<Response> {
	const parsed = parseFrameworkArgs(args);
	if (parsed.error || !parsed.runner || !parsed.dir) {
		return { ok: false, error: parsed.error ?? FRAMEWORK_USAGE };
	}

	const cwd = options.cwd ?? process.cwd();
	const outputDir = join(cwd, parsed.dir);
	const harnessPath = join(outputDir, "browse-harness.cjs");
	const testFileName = `browse.${parsed.runner}.test.cjs`;
	const testFilePath = join(outputDir, testFileName);

	for (const [absolutePath, relativePath] of [
		[harnessPath, join(parsed.dir, "browse-harness.cjs")],
		[testFilePath, join(parsed.dir, testFileName)],
	] as const) {
		if (existsSync(absolutePath) && !parsed.force) {
			return {
				ok: false,
				error: `${relativePath} already exists. Use --force to overwrite generated files.`,
			};
		}
	}

	try {
		mkdirSync(outputDir, { recursive: true });
		writeFileSync(harnessPath, buildHarnessTemplate());
		writeFileSync(testFilePath, buildFrameworkTestTemplate(parsed.runner));
	} catch (error) {
		return {
			ok: false,
			error: `Failed to write framework starter: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	const runnerCommand = buildFrameworkCommand(
		parsed.runner,
		join(parsed.dir, testFileName),
	).join(" ");

	return {
		ok: true,
		data: [
			`Created ${join(parsed.dir, "browse-harness.cjs")}`,
			`Created ${join(parsed.dir, testFileName)}`,
			"",
			"Next steps:",
			`1. Install ${parsed.runner} if it is not already available in your project.`,
			`2. Run ${runnerCommand}`,
			"3. Optionally set BROWSE_BIN=./dist/browse to target a local build.",
		].join("\n"),
	};
}

export function buildFrameworkCommand(
	runner: FrameworkRunner,
	target?: string,
): string[] {
	if (runner === "vitest") {
		return ["vitest", "run", ...(target ? [target] : [])];
	}
	if (runner === "jest") {
		return ["jest", "--runInBand", ...(target ? [target] : [])];
	}
	throw new Error(`Unsupported framework: ${runner}`);
}
