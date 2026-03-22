import { existsSync, readFileSync } from "node:fs";
import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

type ApiAssertResult = {
	url: string;
	method: string;
	status: number;
	timing: number;
	size: number;
	assertions: { name: string; passed: boolean; detail: string }[];
};

export async function handleApiAssert(
	page: Page,
	args: string[],
	options?: { json?: boolean },
): Promise<Response> {
	const jsonOutput = options?.json ?? false;

	if (args.length === 0) {
		return {
			ok: false,
			error: `Usage: browse api-assert <url-pattern> [flags]

Flags:
  --status <code>            Expected HTTP status code
  --method <method>          Match only this HTTP method (default: any)
  --schema <path>            JSON Schema file to validate response
  --timing "<Nms"            Max response time (e.g., "<500ms")
  --body-contains <string>   Response must contain string
  --body-not-contains <str>  Response must not contain string
  --max-size <size>          Max response size (e.g., 500kb, 1mb)
  --header <name: value>     Expected response header
  --timeout <ms>             Wait timeout (default: 10000)
  --json                     JSON output`,
		};
	}

	const urlPattern = args[0];

	// Parse flags
	const expectedStatus = parseIntFlag(args, "--status");
	const expectedMethod = parseStringFlag(args, "--method");
	const schemaPath = parseStringFlag(args, "--schema");
	const timingBudget = parseTimingFlag(args, "--timing");
	const bodyContains = parseStringFlag(args, "--body-contains");
	const bodyNotContains = parseStringFlag(args, "--body-not-contains");
	const maxSize = parseSizeFlag(args, "--max-size");
	const expectedHeader = parseStringFlag(args, "--header");
	const timeout = parseIntFlag(args, "--timeout") ?? 10_000;

	try {
		// Wait for a matching network response
		const startTime = Date.now();
		const response = await page.waitForResponse(
			(resp) => {
				const url = resp.url();
				const method = resp.request().method();
				const urlMatch = url.includes(urlPattern);
				const methodMatch =
					!expectedMethod || method === expectedMethod.toUpperCase();
				return urlMatch && methodMatch;
			},
			{ timeout },
		);

		const timing = Date.now() - startTime;
		const status = response.status();
		const method = response.request().method();
		const url = response.url();

		let body: string;
		try {
			body = await response.text();
		} catch {
			body = "";
		}

		const size = Buffer.byteLength(body, "utf-8");
		const assertions: { name: string; passed: boolean; detail: string }[] = [];

		// Status assertion
		if (expectedStatus !== undefined) {
			assertions.push({
				name: "Status",
				passed: status === expectedStatus,
				detail: `${status} (expected ${expectedStatus})`,
			});
		}

		// Timing assertion
		if (timingBudget !== undefined) {
			assertions.push({
				name: "Timing",
				passed: timing <= timingBudget,
				detail: `${timing}ms (budget: <${timingBudget}ms)`,
			});
		}

		// Body contains
		if (bodyContains) {
			assertions.push({
				name: "Body contains",
				passed: body.includes(bodyContains),
				detail: bodyContains,
			});
		}

		// Body not contains
		if (bodyNotContains) {
			assertions.push({
				name: "Body not contains",
				passed: !body.includes(bodyNotContains),
				detail: bodyNotContains,
			});
		}

		// Max size
		if (maxSize !== undefined) {
			assertions.push({
				name: "Size",
				passed: size <= maxSize,
				detail: `${formatBytes(size)} (max: ${formatBytes(maxSize)})`,
			});
		}

		// Header assertion
		if (expectedHeader) {
			const [headerName, ...valueParts] = expectedHeader.split(":");
			const expectedValue = valueParts.join(":").trim();
			const headers = response.headers();
			const actualValue = headers[headerName.trim().toLowerCase()] ?? null;

			if (expectedValue === "*") {
				assertions.push({
					name: `Header ${headerName.trim()}`,
					passed: actualValue !== null,
					detail: actualValue ?? "not present",
				});
			} else {
				assertions.push({
					name: `Header ${headerName.trim()}`,
					passed: actualValue === expectedValue,
					detail: `"${actualValue}" (expected "${expectedValue}")`,
				});
			}
		}

		// Schema validation
		if (schemaPath) {
			if (!existsSync(schemaPath)) {
				assertions.push({
					name: "Schema",
					passed: false,
					detail: `Schema file not found: ${schemaPath}`,
				});
			} else {
				try {
					const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
					const bodyJson = JSON.parse(body);
					const errors = validateSchema(bodyJson, schema);
					assertions.push({
						name: "Schema",
						passed: errors.length === 0,
						detail:
							errors.length === 0
								? `Valid against ${schemaPath}`
								: `${errors.length} error(s): ${errors.slice(0, 3).join("; ")}`,
					});
				} catch (err) {
					assertions.push({
						name: "Schema",
						passed: false,
						detail: `Validation error: ${err instanceof Error ? err.message : String(err)}`,
					});
				}
			}
		}

		const result: ApiAssertResult = {
			url,
			method,
			status,
			timing,
			size,
			assertions,
		};

		if (jsonOutput) {
			return { ok: true, data: JSON.stringify(result) };
		}

		const allPassed = assertions.every((a) => a.passed);
		const passed = assertions.filter((a) => a.passed).length;
		const lines = [`API Assert: ${method} ${url} → ${status} (${timing}ms)`];
		for (const a of assertions) {
			lines.push(`  ${a.passed ? "[PASS]" : "[FAIL]"} ${a.name}: ${a.detail}`);
		}
		lines.push("");
		lines.push(`Result: ${passed}/${assertions.length} assertions passed`);

		return {
			ok: allPassed,
			...(allPassed ? { data: lines.join("\n") } : { error: lines.join("\n") }),
		} as Response;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes("Timeout")) {
			return {
				ok: false,
				error: `No matching request for "${urlPattern}" within ${timeout}ms`,
			};
		}
		return { ok: false, error: `API assertion failed: ${message}` };
	}
}

function parseStringFlag(args: string[], flag: string): string | undefined {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

function parseIntFlag(args: string[], flag: string): number | undefined {
	const val = parseStringFlag(args, flag);
	if (val === undefined) return undefined;
	const n = Number.parseInt(val, 10);
	return Number.isNaN(n) ? undefined : n;
}

function parseTimingFlag(args: string[], flag: string): number | undefined {
	const val = parseStringFlag(args, flag);
	if (!val) return undefined;
	const match = val.match(/<?(\d+)ms/);
	if (match) return Number.parseInt(match[1], 10);
	return undefined;
}

function parseSizeFlag(args: string[], flag: string): number | undefined {
	const val = parseStringFlag(args, flag);
	if (!val) return undefined;
	const match = val.match(/^(\d+)(kb|mb|gb)?$/i);
	if (!match) return undefined;
	const num = Number.parseInt(match[1], 10);
	const unit = (match[2] ?? "b").toLowerCase();
	switch (unit) {
		case "kb":
			return num * 1024;
		case "mb":
			return num * 1024 * 1024;
		case "gb":
			return num * 1024 * 1024 * 1024;
		default:
			return num;
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Minimal JSON Schema validator supporting type, required, properties, items, enum, pattern.
 */
function validateSchema(
	data: unknown,
	schema: Record<string, unknown>,
	path = "$",
): string[] {
	const errors: string[] = [];

	if (schema.type) {
		const actualType = Array.isArray(data)
			? "array"
			: data === null
				? "null"
				: typeof data;
		if (actualType !== schema.type) {
			errors.push(
				`${path}: expected type "${schema.type}", got "${actualType}"`,
			);
			return errors;
		}
	}

	if (schema.enum && Array.isArray(schema.enum)) {
		if (!(schema.enum as unknown[]).includes(data)) {
			errors.push(
				`${path}: value not in enum [${(schema.enum as unknown[]).join(", ")}]`,
			);
		}
	}

	if (schema.pattern && typeof data === "string") {
		if (!new RegExp(schema.pattern as string).test(data)) {
			errors.push(`${path}: does not match pattern "${schema.pattern}"`);
		}
	}

	if (
		schema.type === "object" &&
		typeof data === "object" &&
		data !== null &&
		!Array.isArray(data)
	) {
		const obj = data as Record<string, unknown>;
		const required = (schema.required as string[]) ?? [];
		for (const key of required) {
			if (!(key in obj)) {
				errors.push(`${path}: missing required property "${key}"`);
			}
		}

		const properties =
			(schema.properties as Record<string, Record<string, unknown>>) ?? {};
		for (const [key, propSchema] of Object.entries(properties)) {
			if (key in obj) {
				errors.push(...validateSchema(obj[key], propSchema, `${path}.${key}`));
			}
		}
	}

	if (schema.type === "array" && Array.isArray(data) && schema.items) {
		for (let i = 0; i < data.length; i++) {
			errors.push(
				...validateSchema(
					data[i],
					schema.items as Record<string, unknown>,
					`${path}[${i}]`,
				),
			);
		}
	}

	return errors;
}
