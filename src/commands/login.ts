import type { Page } from "playwright";
import type { BrowseConfig, EnvironmentConfig } from "../config.ts";
import type { Response } from "../protocol.ts";
import { compileSafePattern } from "../safe-pattern.ts";

const DEFAULT_USERNAME_FIELDS = ["Username", "Email"];
const DEFAULT_PASSWORD_FIELDS = ["Password"];
const DEFAULT_SUBMIT_BUTTONS = ["Sign in", "Log in"];

export async function handleLogin(
	config: BrowseConfig | null,
	page: Page,
	args: string[],
): Promise<Response> {
	if (!config) {
		return {
			ok: false,
			error:
				"No browse.config.json found. Create one with login environments or use goto + fill + click manually.",
		};
	}

	// Parse --env flag
	let envName: string | undefined;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--env") {
			envName = args[i + 1];
			break;
		}
	}

	if (!envName) {
		return {
			ok: false,
			error: "Missing --env flag. Usage: browse login --env <environment>",
		};
	}

	const envConfig = config.environments[envName];
	if (!envConfig) {
		const available = Object.keys(config.environments).join(", ");
		return {
			ok: false,
			error: `Unknown environment: '${envName}'. Available: ${available}.`,
		};
	}

	// Read credentials from environment variables
	const username = process.env[envConfig.userEnvVar];
	const password = process.env[envConfig.passEnvVar];

	if (!username || !password) {
		return {
			ok: false,
			error: `Missing credentials. Set ${envConfig.userEnvVar} and ${envConfig.passEnvVar} environment variables.`,
		};
	}

	try {
		// Navigate to login page
		await page.goto(envConfig.loginUrl, {
			waitUntil: "domcontentloaded",
			timeout: 30_000,
		});

		// Fill username field
		const usernameNames = envConfig.usernameField
			? [envConfig.usernameField]
			: DEFAULT_USERNAME_FIELDS;
		await fillField(page, usernameNames, username);

		// Fill password field
		const passwordNames = envConfig.passwordField
			? [envConfig.passwordField]
			: DEFAULT_PASSWORD_FIELDS;
		await fillField(page, passwordNames, password);

		// Click submit button
		const submitNames = envConfig.submitButton
			? [envConfig.submitButton]
			: DEFAULT_SUBMIT_BUTTONS;
		await clickButton(page, submitNames);

		// Wait for success condition
		await waitForSuccess(page, envConfig);

		const currentUrl = page.url();
		return {
			ok: true,
			data: `Logged in to ${envName}. Current page: ${currentUrl}`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);

		// Auto-screenshot on failure
		let screenshotInfo = "";
		try {
			const screenshotPath = `/tmp/browse-login-failure-${Date.now()}.png`;
			await page.screenshot({ path: screenshotPath, fullPage: false });
			screenshotInfo = ` Screenshot saved to ${screenshotPath}.`;
		} catch {
			// Ignore screenshot failure
		}

		return {
			ok: false,
			error: `Login failed: ${message}.${screenshotInfo}`,
		};
	}
}

async function fillField(
	page: Page,
	names: string[],
	value: string,
): Promise<void> {
	for (const name of names) {
		try {
			const locator = page.getByRole("textbox", { name });
			await locator.fill(value, { timeout: 5_000 });
			return;
		} catch {
			// Try next name
		}
	}
	throw new Error(`Could not find input field matching: ${names.join(", ")}`);
}

async function clickButton(page: Page, names: string[]): Promise<void> {
	for (const name of names) {
		try {
			const locator = page.getByRole("button", { name });
			await locator.click({ timeout: 5_000 });
			return;
		} catch {
			// Try next name
		}
	}
	throw new Error(`Could not find submit button matching: ${names.join(", ")}`);
}

async function waitForSuccess(
	page: Page,
	config: EnvironmentConfig,
): Promise<void> {
	const condition = config.successCondition;

	if ("urlContains" in condition) {
		await page.waitForURL(`**/*${condition.urlContains}*`, {
			timeout: 10_000,
		});
	} else if ("urlPattern" in condition) {
		await page.waitForURL(compileSafePattern(condition.urlPattern), {
			timeout: 10_000,
		});
	} else if ("elementVisible" in condition) {
		await page.waitForSelector(condition.elementVisible, {
			state: "visible",
			timeout: 10_000,
		});
	}
}
