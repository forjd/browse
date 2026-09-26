import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	buildCucumberCommand,
	buildCucumberConfigTemplate,
	buildFeatureTemplate,
	buildStepDefinitionsTemplate,
	FAILING_EXAMPLE_TAG,
} from "./gherkin-runner.ts";
import type { Response } from "./protocol.ts";

export type FrameworkRunner = "jest" | "vitest" | "cucumber";

export const FRAMEWORK_RUNNERS: FrameworkRunner[] = [
	"vitest",
	"jest",
	"cucumber",
];

const DEFAULT_OUTPUT_DIR = "tests";
const FRAMEWORK_USAGE =
	"Usage: browse framework init <vitest|jest|cucumber> [--dir <path>] [--force]";

function isFrameworkRunner(
	value: string | undefined,
): value is FrameworkRunner {
	return FRAMEWORK_RUNNERS.includes(value as FrameworkRunner);
}

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

function buildFrameworkTestTemplate(
	runner: Exclude<FrameworkRunner, "cucumber">,
): string {
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
	if (!isFrameworkRunner(runner)) {
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
	const runner = parsed.runner;
	const plan =
		runner === "cucumber"
			? planCucumberScaffold(parsed.dir)
			: planUnitScaffold(runner, parsed.dir);

	for (const file of plan.files) {
		if (existsSync(join(cwd, file.path)) && !parsed.force) {
			return {
				ok: false,
				error: `${file.path} already exists. Use --force to overwrite generated files.`,
			};
		}
	}

	try {
		for (const file of plan.files) {
			const absolutePath = join(cwd, file.path);
			mkdirSync(dirname(absolutePath), { recursive: true });
			writeFileSync(absolutePath, file.contents);
		}
	} catch (error) {
		return {
			ok: false,
			error: `Failed to write framework starter: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	return {
		ok: true,
		data: [
			...plan.files.map((file) => `Created ${file.path}`),
			"",
			"Next steps:",
			...plan.nextSteps.map((step, index) => `${index + 1}. ${step}`),
		].join("\n"),
	};
}

type ScaffoldFile = { path: string; contents: string };

type ScaffoldPlan = { files: ScaffoldFile[]; nextSteps: string[] };

function planUnitScaffold(
	runner: Exclude<FrameworkRunner, "cucumber">,
	dir: string,
): ScaffoldPlan {
	const testFileName = `browse.${runner}.test.cjs`;
	const runnerCommand = buildFrameworkCommand(
		runner,
		join(dir, testFileName),
	).join(" ");

	return {
		files: [
			{
				path: join(dir, "browse-harness.cjs"),
				contents: buildHarnessTemplate(),
			},
			{
				path: join(dir, testFileName),
				contents: buildFrameworkTestTemplate(runner),
			},
		],
		nextSteps: [
			`Install ${runner} if it is not already available in your project.`,
			`Run ${runnerCommand}`,
			"Optionally set BROWSE_BIN=./dist/browse to target a local build.",
		],
	};
}

function planCucumberScaffold(dir: string): ScaffoldPlan {
	const featureDir = join(dir, "features");
	const stepsDir = join(dir, "step-definitions");
	const configPath = join(dir, "cucumber.cjs");
	const runCommand = buildCucumberCommand(undefined, {
		config: configPath,
	}).join(" ");
	const failingCommand = buildCucumberCommand(undefined, {
		config: configPath,
		tags: FAILING_EXAMPLE_TAG,
	}).join(" ");

	return {
		files: [
			{
				path: join(dir, "browse-harness.cjs"),
				contents: buildHarnessTemplate(),
			},
			{
				path: join(featureDir, "browse.feature"),
				contents: buildFeatureTemplate(),
			},
			{
				path: join(stepsDir, "browse.steps.cjs"),
				// Steps live one directory deeper than the harness.
				contents: buildStepDefinitionsTemplate("../browse-harness.cjs"),
			},
			{
				path: configPath,
				contents: buildCucumberConfigTemplate(stepsDir, featureDir),
			},
		],
		nextSteps: [
			"Install the Cucumber runner: npm install --save-dev @cucumber/cucumber",
			`Run ${runCommand}`,
			`See a failing report with ${failingCommand}`,
			"Optionally set BROWSE_BIN=./dist/browse to target a local build.",
		],
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
	if (runner === "cucumber") {
		return buildCucumberCommand(target);
	}
	throw new Error(`Unsupported framework: ${runner}`);
}
