import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { handleSnapshot } from "./snapshot.ts";

const FILLABLE_ROLES = ["textbox", "searchbox", "spinbutton", "combobox"];
const SELECTABLE_ROLES = ["combobox", "listbox"];
const CHECKABLE_ROLES = ["checkbox", "radio", "switch"];

/**
 * Bulk form fill: fill multiple fields in one command.
 *
 * Usage:
 *   browse form @formRef --data '{"email":"test@example.com","password":"secret"}'
 *   browse form --data '{"email":"test@example.com","password":"secret"}'
 *
 * Matches field names/labels to data keys using Playwright's role-based locators.
 * Supports text inputs, selects, checkboxes, and radio buttons.
 */
export async function handleForm(
	page: Page,
	args: string[],
): Promise<Response> {
	// Parse --data flag
	let dataStr: string | undefined;
	let autoSnapshot = false;
	const positional: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--data") {
			dataStr = args[i + 1];
			i++;
		} else if (arg === "--auto-snapshot") {
			autoSnapshot = true;
		} else if (!arg.startsWith("--")) {
			positional.push(arg);
		}
	}

	if (!dataStr) {
		return {
			ok: false,
			error:
				'Usage: browse form --data \'{"field":"value",...}\' [--auto-snapshot]\n\nFills multiple form fields in one command. Keys are matched against field labels/names.',
		};
	}

	let data: Record<string, string | boolean>;
	try {
		data = JSON.parse(dataStr);
	} catch {
		return {
			ok: false,
			error: 'Invalid JSON for --data. Expected: {"field": "value", ...}',
		};
	}

	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		return {
			ok: false,
			error:
				"Invalid --data: must be a JSON object mapping field names to values.",
		};
	}

	const filled: string[] = [];
	const errors: string[] = [];

	for (const [fieldName, value] of Object.entries(data)) {
		try {
			if (typeof value === "boolean") {
				// Handle checkbox/switch/radio
				let checked = false;
				for (const role of CHECKABLE_ROLES) {
					const locator = page.getByRole(
						role as Parameters<Page["getByRole"]>[0],
						{ name: fieldName },
					);
					if ((await locator.count()) > 0) {
						if (value) {
							await locator.first().check({ timeout: 5_000 });
						} else {
							await locator.first().uncheck({ timeout: 5_000 });
						}
						filled.push(`${fieldName}: ${value} (${role})`);
						checked = true;
						break;
					}
				}
				if (!checked) {
					errors.push(
						`${fieldName}: no checkbox/switch/radio found with this label`,
					);
				}
				continue;
			}

			// Try fillable roles first (text inputs)
			let fieldFilled = false;
			for (const role of FILLABLE_ROLES) {
				const locator = page.getByRole(
					role as Parameters<Page["getByRole"]>[0],
					{ name: fieldName },
				);
				if ((await locator.count()) > 0) {
					await locator.first().fill(String(value), { timeout: 5_000 });
					filled.push(`${fieldName}: "${value}" (${role})`);
					fieldFilled = true;
					break;
				}
			}

			if (fieldFilled) continue;

			// Try selectable roles (dropdowns)
			for (const role of SELECTABLE_ROLES) {
				const locator = page.getByRole(
					role as Parameters<Page["getByRole"]>[0],
					{ name: fieldName },
				);
				if ((await locator.count()) > 0) {
					await locator.first().selectOption(String(value), { timeout: 5_000 });
					filled.push(`${fieldName}: "${value}" (${role})`);
					fieldFilled = true;
					break;
				}
			}

			if (fieldFilled) continue;

			// Try by label as fallback
			const labelLocator = page.getByLabel(fieldName);
			if ((await labelLocator.count()) > 0) {
				const tagName = await labelLocator
					.first()
					.evaluate((el) => el.tagName.toLowerCase());
				if (tagName === "select") {
					await labelLocator
						.first()
						.selectOption(String(value), { timeout: 5_000 });
					filled.push(`${fieldName}: "${value}" (select by label)`);
				} else {
					await labelLocator.first().fill(String(value), { timeout: 5_000 });
					filled.push(`${fieldName}: "${value}" (by label)`);
				}
				continue;
			}

			errors.push(`${fieldName}: no matching form field found`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			errors.push(`${fieldName}: ${message}`);
		}
	}

	const lines: string[] = [];
	if (filled.length > 0) {
		lines.push(
			`Filled ${filled.length} field${filled.length !== 1 ? "s" : ""}:`,
		);
		for (const f of filled) {
			lines.push(`  ✓ ${f}`);
		}
	}
	if (errors.length > 0) {
		lines.push(
			`Failed ${errors.length} field${errors.length !== 1 ? "s" : ""}:`,
		);
		for (const e of errors) {
			lines.push(`  ✗ ${e}`);
		}
	}

	let result = lines.join("\n");

	if (autoSnapshot) {
		const snapshotResult = await handleSnapshot(page, []);
		if (snapshotResult.ok) {
			result += `\n\n${snapshotResult.data}`;
		}
	}

	if (errors.length > 0 && filled.length === 0) {
		return { ok: false, error: result };
	}

	return { ok: true, data: result };
}
