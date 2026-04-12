import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Response } from "../protocol.ts";

const GITHUB_ACTIONS_TEMPLATE = `name: Browse QA

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Build browse
        run: ./setup.sh

      - name: Install browser binaries
        run: bun x patchright install --with-deps chromium

      - name: Run healthcheck
        run: ./dist/browse healthcheck --reporter junit
        env:
          BROWSE_HEADED: "0"
`;

const GITLAB_CI_TEMPLATE = `browse-qa:
  image: node:20
  before_script:
    - curl -fsSL https://bun.sh/install | bash
    - export PATH="$HOME/.bun/bin:$PATH"
    - bun install
    - ./setup.sh
    - bun x patchright install --with-deps chromium
  script:
    - ./dist/browse healthcheck --reporter junit
  variables:
    BROWSE_HEADED: "0"
`;

const CIRCLECI_TEMPLATE = `version: 2.1

jobs:
  browse-qa:
    docker:
      - image: mcr.microsoft.com/playwright:v1.51.0-noble
    steps:
      - checkout
      - run:
          name: Install Bun
          command: curl -fsSL https://bun.sh/install | bash
      - run:
          name: Build browse
          command: |
            export PATH="$HOME/.bun/bin:$PATH"
            bun install
            ./setup.sh
      - run:
          name: Run QA
          command: ./dist/browse healthcheck --reporter junit
          environment:
            BROWSE_HEADED: "0"

workflows:
  qa:
    jobs:
      - browse-qa
`;

type CISystem = "github" | "gitlab" | "circleci";

function detectCI(): CISystem | null {
	if (existsSync(".github")) return "github";
	if (existsSync(".gitlab-ci.yml")) return "gitlab";
	if (existsSync(".circleci")) return "circleci";
	return null;
}

function generateCI(ci: CISystem): { path: string; content: string } {
	switch (ci) {
		case "github":
			return {
				path: ".github/workflows/browse-qa.yml",
				content: GITHUB_ACTIONS_TEMPLATE,
			};
		case "gitlab":
			return {
				path: ".gitlab-ci.yml",
				content: GITLAB_CI_TEMPLATE,
			};
		case "circleci":
			return {
				path: ".circleci/config.yml",
				content: CIRCLECI_TEMPLATE,
			};
	}
}

export async function handleCiInit(
	_page: unknown,
	args: string[],
): Promise<Response> {
	let ci: CISystem | null = null;

	const ciIdx = args.indexOf("--ci");
	if (ciIdx !== -1 && ciIdx + 1 < args.length) {
		const val = args[ciIdx + 1];
		if (val === "github" || val === "gitlab" || val === "circleci") {
			ci = val;
		} else {
			return {
				ok: false,
				error: `Unknown CI system: "${val}". Supported: github, gitlab, circleci`,
			};
		}
	} else {
		ci = detectCI();
	}

	if (!ci) {
		return {
			ok: false,
			error:
				"Could not detect CI system. Use --ci <github|gitlab|circleci> to specify.",
		};
	}

	const { path, content } = generateCI(ci);

	const dir = join(process.cwd(), ...path.split("/").slice(0, -1));
	mkdirSync(dir, { recursive: true });

	const fullPath = join(process.cwd(), path);
	if (existsSync(fullPath) && !args.includes("--force")) {
		return {
			ok: false,
			error: `${path} already exists. Use --force to overwrite.`,
		};
	}

	writeFileSync(fullPath, content);

	const hasConfig = existsSync("browse.config.json");
	const lines = [`Created ${path}`];
	lines.push("");
	lines.push("Next steps:");
	if (!hasConfig) {
		lines.push('  1. Run "browse init" to create a browse.config.json');
		lines.push("  2. Configure environments, flows, and healthcheck pages");
		lines.push("  3. Set secrets in your CI system:");
	} else {
		lines.push("  1. Set secrets in your CI system:");
	}
	lines.push("     - STAGING_USER, STAGING_PASS (if using login)");
	lines.push("     - ANTHROPIC_API_KEY (if using assert-ai)");
	lines.push(`  ${hasConfig ? "2" : "4"}. Push to trigger the workflow`);

	return { ok: true, data: lines.join("\n") };
}
