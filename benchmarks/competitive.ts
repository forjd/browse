import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import {
	assertSuccess,
	bestEffortQuit,
	createBatchFile,
	createTempDir,
	fixtureUrl,
	removeDir,
	resolveOutputDir,
	runBrowse,
	runShell,
	summariseDurations,
	writeJsonArtifact,
} from "./lib.ts";

const iterations = Number.parseInt(
	process.env.BROWSE_BENCHMARK_ITERATIONS ?? "3",
	10,
);
const outDir = resolveOutputDir("competitive");
const scenarioUrl = fixtureUrl("register.html");

async function runBrowseScenario(): Promise<number[]> {
	const screenshotPath = join(outDir, "browse-competitive.png");
	const batchFile = createBatchFile(outDir, "competitive-browse.json", [
		{ cmd: "goto", args: [scenarioUrl] },
		{ cmd: "text", args: [] },
		{ cmd: "screenshot", args: [screenshotPath] },
	]);

	const durations: number[] = [];
	await bestEffortQuit();
	try {
		for (let i = 0; i < iterations; i++) {
			const run = await runBrowse(["batch", batchFile, "--json"]);
			assertSuccess(run, `browse scenario ${i + 1}`);
			durations.push(run.durationMs);
		}
	} finally {
		await bestEffortQuit();
	}
	return durations;
}

async function runPlaywrightScenario(): Promise<number[]> {
	const durations: number[] = [];
	const browser = await chromium.launch({ headless: true });

	try {
		for (let i = 0; i < iterations; i++) {
			const page = await browser.newPage();
			const start = performance.now();
			await page.goto(scenarioUrl);
			await page.textContent("body");
			await page.screenshot({
				path: join(outDir, `playwright-competitive-${i + 1}.png`),
			});
			durations.push(Math.round(performance.now() - start));
			await page.close();
		}
	} finally {
		await browser.close();
	}

	return durations;
}

async function runCypressScenario(): Promise<
	| { status: "skipped"; reason: string }
	| { status: "ok"; summary: ReturnType<typeof summariseDurations> }
	| { status: "failed"; reason: string }
> {
	const versionCheck = await runShell("npx --no-install cypress --version");
	if (versionCheck.exitCode !== 0) {
		return { status: "skipped", reason: "Cypress is not installed locally." };
	}

	const projectDir = createTempDir("browse-cypress-");
	const specPath = join(projectDir, "competitive.cy.js");

	try {
		writeFileSync(
			join(projectDir, "cypress.config.cjs"),
			"module.exports = { e2e: { supportFile: false, specPattern: '*.cy.js' }, video: false, screenshotOnRunFailure: false };\n",
		);
		writeFileSync(
			specPath,
			`describe("competitive", () => {
  it("navigates, reads text, and captures a screenshot", () => {
    cy.visit(Cypress.env("TARGET_URL"));
    cy.contains("Register");
    cy.screenshot("competitive");
  });
});
`,
		);

		const durations: number[] = [];
		for (let i = 0; i < iterations; i++) {
			const run = await runShell(
				`npx --no-install cypress run --headless --browser chrome --project "${projectDir}" --spec "${specPath}" --config video=false,screenshotOnRunFailure=false`,
				{
					env: {
						TARGET_URL: scenarioUrl,
					},
				},
			);
			if (run.exitCode !== 0) {
				return {
					status: "failed",
					reason: run.stderr || run.stdout || "Cypress run failed.",
				};
			}
			durations.push(run.durationMs);
		}

		return { status: "ok", summary: summariseDurations(durations) };
	} finally {
		removeDir(projectDir);
	}
}

async function runSeleniumScenario(): Promise<
	| { status: "skipped"; reason: string }
	| { status: "ok"; summary: ReturnType<typeof summariseDurations> }
	| { status: "failed"; reason: string }
> {
	const moduleCheck = await runShell("python3 -c 'import selenium'");
	if (moduleCheck.exitCode !== 0) {
		return {
			status: "skipped",
			reason: "Python selenium is not installed in this environment.",
		};
	}

	const scriptDir = createTempDir("browse-selenium-");
	const scriptPath = join(scriptDir, "competitive.py");
	mkdirSync(scriptDir, { recursive: true });

	try {
		writeFileSync(
			scriptPath,
			`import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

url = os.environ["TARGET_URL"]
shot = os.environ["SCREENSHOT_PATH"]

options = Options()
options.add_argument("--headless=new")
driver = webdriver.Chrome(options=options)
try:
    driver.get(url)
    driver.find_element("tag name", "body").text
    driver.save_screenshot(shot)
finally:
    driver.quit()
`,
		);

		const durations: number[] = [];
		for (let i = 0; i < iterations; i++) {
			const run = await runShell(`python3 "${scriptPath}"`, {
				env: {
					TARGET_URL: scenarioUrl,
					SCREENSHOT_PATH: join(outDir, `selenium-competitive-${i + 1}.png`),
				},
			});
			if (run.exitCode !== 0) {
				return {
					status: "failed",
					reason: run.stderr || run.stdout || "Selenium run failed.",
				};
			}
			durations.push(run.durationMs);
		}

		return { status: "ok", summary: summariseDurations(durations) };
	} finally {
		removeDir(scriptDir);
	}
}

const browseDurations = await runBrowseScenario();
const playwrightDurations = await runPlaywrightScenario();
const cypress = await runCypressScenario();
const selenium = await runSeleniumScenario();

const report = {
	timestamp: new Date().toISOString(),
	scenario: "goto + text + screenshot on a local register fixture",
	browse: summariseDurations(browseDurations),
	playwright: summariseDurations(playwrightDurations),
	cypress,
	selenium,
};

const outPath = writeJsonArtifact(outDir, "competitive.json", report);
process.stdout.write(`${JSON.stringify({ outPath, ...report }, null, 2)}\n`);
