import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Response } from "../protocol.ts";

const TEMPLATE_CONFIG = JSON.stringify(
	{
		environments: {
			staging: {
				loginUrl: "https://staging.example.com/login",
				userEnvVar: "STAGING_USER",
				passEnvVar: "STAGING_PASS",
				usernameField: "#email",
				passwordField: "#password",
				submitButton: "button[type=submit]",
				successCondition: { urlContains: "/dashboard" },
			},
		},
		flows: {
			"check-homepage": {
				description: "Navigate to homepage and verify key elements",
				steps: [
					{ goto: "https://staging.example.com" },
					{ snapshot: true },
					{ assert: { visible: "h1" } },
					{ screenshot: true },
				],
			},
		},
		healthcheck: {
			pages: [
				{
					url: "https://staging.example.com",
					name: "Homepage",
					screenshot: true,
					console: "error",
					assertions: [{ visible: "body" }],
				},
			],
		},
		timeout: 30000,
	},
	null,
	2,
);

export async function handleInit(args: string[]): Promise<Response> {
	const force = args.includes("--force");
	const pathArgs = args.filter((a) => a !== "--force");
	const outputPath = resolve(pathArgs[0] ?? "./browse.config.json");

	if (existsSync(outputPath) && !force) {
		return {
			ok: false,
			error: `File already exists: ${outputPath}\nUse --force to overwrite.`,
		};
	}

	try {
		writeFileSync(outputPath, `${TEMPLATE_CONFIG}\n`, "utf-8");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `Failed to write config: ${message}` };
	}

	return { ok: true, data: `Created ${outputPath}` };
}
