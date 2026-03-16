import type { Page } from "playwright";
import type { AssertCondition, BrowseConfig } from "../config.ts";
import { interpolateVars, parseVars } from "../flow-runner.ts";
import type { Response } from "../protocol.ts";
import { resolveLocator } from "../refs.ts";
import { compileSafePattern } from "../safe-pattern.ts";

export type AssertResult = {
	passed: boolean;
	reason: string;
};

export type ParsedAssert =
	| { condition: AssertCondition }
	| {
			permission: { name: string; direction: "granted" | "denied" };
			vars: Record<string, string>;
	  }
	| { error: string };

export function parseAssertArgs(args: string[]): ParsedAssert {
	if (args.length === 0) {
		return {
			error:
				"Usage: browse assert <type> <args...>\nTypes: visible, not-visible, text-contains, text-not-contains, url-contains, url-pattern, element-text, element-count, permission",
		};
	}

	const subcommand = args[0];

	switch (subcommand) {
		case "visible":
			if (!args[1])
				return { error: "Usage: browse assert visible <selector|@ref>" };
			return { condition: { visible: args[1] } };

		case "not-visible":
			if (!args[1])
				return { error: "Usage: browse assert not-visible <selector|@ref>" };
			return { condition: { notVisible: args[1] } };

		case "text-contains":
			if (!args[1])
				return { error: "Usage: browse assert text-contains <text>" };
			return { condition: { textContains: args[1] } };

		case "text-not-contains":
			if (!args[1])
				return { error: "Usage: browse assert text-not-contains <text>" };
			return { condition: { textNotContains: args[1] } };

		case "url-contains":
			if (!args[1])
				return { error: "Usage: browse assert url-contains <substring>" };
			return { condition: { urlContains: args[1] } };

		case "url-pattern":
			if (!args[1])
				return { error: "Usage: browse assert url-pattern <regex>" };
			return { condition: { urlPattern: args[1] } };

		case "element-text":
			if (!args[1] || !args[2])
				return {
					error: "Usage: browse assert element-text <selector|@ref> <text>",
				};
			return {
				condition: { elementText: { selector: args[1], contains: args[2] } },
			};

		case "element-count": {
			if (!args[1] || !args[2])
				return {
					error: "Usage: browse assert element-count <selector|@ref> <count>",
				};
			const count = Number.parseInt(args[2], 10);
			if (Number.isNaN(count))
				return {
					error: `Invalid count: '${args[2]}'. Must be a number.`,
				};
			return {
				condition: { elementCount: { selector: args[1], count } },
			};
		}

		case "permission": {
			if (!args[1] || !args[2])
				return {
					error:
						"Usage: browse assert permission <name> granted|denied [--var key=value ...]",
				};
			const direction = args[2];
			if (direction !== "granted" && direction !== "denied") {
				return {
					error: `Expected 'granted' or 'denied', got '${direction}'. Usage: browse assert permission <name> granted|denied`,
				};
			}
			const vars = parseVars(args.slice(3));
			return { permission: { name: args[1], direction }, vars };
		}

		default:
			return {
				error: `Unknown assert type: '${subcommand}'. Valid types: visible, not-visible, text-contains, text-not-contains, url-contains, url-pattern, element-text, element-count, permission`,
			};
	}
}

export async function evaluateAssertCondition(
	page: Page,
	condition: AssertCondition,
): Promise<AssertResult> {
	if ("visible" in condition) {
		const resolved = resolveLocator(page, condition.visible);
		if ("error" in resolved) {
			return { passed: false, reason: resolved.error };
		}
		try {
			const visible = await resolved.locator.first().isVisible();
			if (visible) {
				return { passed: true, reason: "" };
			}
			return {
				passed: false,
				reason: "Element not found or not visible.",
			};
		} catch {
			return {
				passed: false,
				reason: "Element not found or not visible.",
			};
		}
	}

	if ("notVisible" in condition) {
		const resolved = resolveLocator(page, condition.notVisible);
		if ("error" in resolved) {
			return { passed: false, reason: resolved.error };
		}
		try {
			const visible = await resolved.locator.first().isVisible();
			if (!visible) {
				return { passed: true, reason: "" };
			}
			return {
				passed: false,
				reason: "Element is visible (expected not visible).",
			};
		} catch {
			// Element not found = not visible = pass
			return { passed: true, reason: "" };
		}
	}

	if ("textContains" in condition) {
		const bodyText = await page.innerText("body");
		if (bodyText.toLowerCase().includes(condition.textContains.toLowerCase())) {
			return { passed: true, reason: "" };
		}
		return {
			passed: false,
			reason: `Page text does not contain "${condition.textContains}".`,
		};
	}

	if ("textNotContains" in condition) {
		const bodyText = await page.innerText("body");
		if (
			!bodyText.toLowerCase().includes(condition.textNotContains.toLowerCase())
		) {
			return { passed: true, reason: "" };
		}
		return {
			passed: false,
			reason: `Page text contains "${condition.textNotContains}" (expected it not to).`,
		};
	}

	if ("urlContains" in condition) {
		const url = page.url();
		if (url.includes(condition.urlContains)) {
			return { passed: true, reason: "" };
		}
		return {
			passed: false,
			reason: `URL does not contain "${condition.urlContains}". Current URL: ${url}`,
		};
	}

	if ("urlPattern" in condition) {
		const url = page.url();
		if (compileSafePattern(condition.urlPattern).test(url)) {
			return { passed: true, reason: "" };
		}
		return {
			passed: false,
			reason: `URL does not match pattern "${condition.urlPattern}". Current URL: ${url}`,
		};
	}

	if ("elementText" in condition) {
		const resolved = resolveLocator(page, condition.elementText.selector);
		if ("error" in resolved) {
			return { passed: false, reason: resolved.error };
		}
		try {
			const text = await resolved.locator.first().innerText();
			if (text.includes(condition.elementText.contains)) {
				return { passed: true, reason: "" };
			}
			return {
				passed: false,
				reason: `Element "${condition.elementText.selector}" text does not contain "${condition.elementText.contains}". Got: "${text}"`,
			};
		} catch {
			return {
				passed: false,
				reason: `Element "${condition.elementText.selector}" not found.`,
			};
		}
	}

	if ("elementCount" in condition) {
		const selector = condition.elementCount.selector;
		const resolved = resolveLocator(page, selector);
		if ("error" in resolved) {
			return { passed: false, reason: resolved.error };
		}
		try {
			const count = await resolved.locator.count();
			if (count === condition.elementCount.count) {
				return { passed: true, reason: "" };
			}
			return {
				passed: false,
				reason: `Element "${selector}" count is ${count}, expected ${condition.elementCount.count}.`,
			};
		} catch {
			return {
				passed: false,
				reason: `Element "${selector}" not found.`,
			};
		}
	}

	return { passed: false, reason: "Unknown assert condition." };
}

function formatConditionLabel(condition: AssertCondition): string {
	if ("visible" in condition) return `visible "${condition.visible}"`;
	if ("notVisible" in condition) return `not-visible "${condition.notVisible}"`;
	if ("textContains" in condition)
		return `text-contains "${condition.textContains}"`;
	if ("textNotContains" in condition)
		return `text-not-contains "${condition.textNotContains}"`;
	if ("urlContains" in condition)
		return `url-contains "${condition.urlContains}"`;
	if ("urlPattern" in condition) return `url-pattern "${condition.urlPattern}"`;
	if ("elementText" in condition)
		return `element-text "${condition.elementText.selector}" "${condition.elementText.contains}"`;
	if ("elementCount" in condition)
		return `element-count "${condition.elementCount.selector}" ${condition.elementCount.count}`;
	return "unknown";
}

export async function handleAssert(
	config: BrowseConfig | null,
	page: Page,
	args: string[],
): Promise<Response> {
	const parsed = parseAssertArgs(args);

	if ("error" in parsed) {
		return { ok: false, error: parsed.error };
	}

	// Permission assertion
	if ("permission" in parsed) {
		if (!config?.permissions) {
			return {
				ok: false,
				error: "No permissions defined in browse.config.json.",
			};
		}

		const permConfig = config.permissions[parsed.permission.name];
		if (!permConfig) {
			const available = Object.keys(config.permissions).join(", ");
			return {
				ok: false,
				error: `Unknown permission: '${parsed.permission.name}'. Available: ${available}.`,
			};
		}

		const pageUrl = interpolateVars(permConfig.page, parsed.vars);

		try {
			await page.goto(pageUrl, {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: `Failed to navigate to ${pageUrl}: ${message}`,
			};
		}

		const condition =
			parsed.permission.direction === "granted"
				? permConfig.granted
				: permConfig.denied;

		const result = await evaluateAssertCondition(page, condition);
		const condLabel = formatConditionLabel(condition);

		if (result.passed) {
			return {
				ok: true,
				data: `PASS: permission "${parsed.permission.name}" ${parsed.permission.direction}\n  → Navigated to ${pageUrl}\n  → Assertion: ${condLabel} — passed`,
			};
		}

		return {
			ok: false,
			error: `FAIL: permission "${parsed.permission.name}" ${parsed.permission.direction}\n  → Navigated to ${pageUrl}\n  → Assertion: ${condLabel} — ${result.reason}`,
		};
	}

	// General assertion
	const condition = parsed.condition;
	const label = formatConditionLabel(condition);
	const result = await evaluateAssertCondition(page, condition);

	if (result.passed) {
		return { ok: true, data: `PASS: ${label}` };
	}

	return {
		ok: false,
		error: `FAIL: ${label}\n  → ${result.reason}`,
	};
}
