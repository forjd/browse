import { afterEach, describe, expect, mock, test } from "bun:test";
import type { BrowsePlugin, CommandContext } from "../src/plugin.ts";
import { validatePlugin } from "../src/plugin-loader.ts";

type ExampleModule = {
	default: BrowsePlugin;
};

function createContext(url = "https://example.com/dashboard"): CommandContext {
	return {
		page: {
			url: () => url,
		} as CommandContext["page"],
		context: {} as CommandContext["context"],
		config: null,
		args: [],
		sessionState: {},
		request: {},
	};
}

describe("official plugin examples", () => {
	const originalFetch = globalThis.fetch;
	const originalEnv = { ...process.env };

	afterEach(() => {
		globalThis.fetch = originalFetch;
		process.env = { ...originalEnv };
	});

	test("exports valid Browse plugins for Slack, Discord, and JIRA", async () => {
		const modules = (await Promise.all([
			import("../examples/plugins/slack/index.ts"),
			import("../examples/plugins/discord/index.ts"),
			import("../examples/plugins/jira/index.ts"),
		])) as ExampleModule[];

		expect(modules.map((module) => module.default.name)).toEqual([
			"browse-plugin-slack",
			"browse-plugin-discord",
			"browse-plugin-jira",
		]);

		for (const module of modules) {
			expect(validatePlugin(module.default, "official-plugin-example")).toBe(
				module.default,
			);
		}
	});

	test("Slack example posts the current page URL to the webhook", async () => {
		const fetchMock = mock(() => Promise.resolve(new Response("ok")));
		globalThis.fetch = fetchMock;
		process.env.BROWSE_SLACK_WEBHOOK_URL =
			"https://hooks.slack.test/services/123";

		const { default: plugin } = (await import(
			"../examples/plugins/slack/index.ts"
		)) as ExampleModule;
		const result = await plugin.commands?.[0].handler(createContext());

		expect(result).toEqual({
			ok: true,
			data: "Sent Slack notification.",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://hooks.slack.test/services/123");
		expect(JSON.parse(init.body as string)).toEqual({
			text: "Browse run update: https://example.com/dashboard",
		});
	});

	test("Discord example requires its webhook URL", async () => {
		delete process.env.BROWSE_DISCORD_WEBHOOK_URL;

		const { default: plugin } = (await import(
			"../examples/plugins/discord/index.ts"
		)) as ExampleModule;
		const result = await plugin.commands?.[0].handler(createContext());

		expect(result).toEqual({
			ok: false,
			error: "Set BROWSE_DISCORD_WEBHOOK_URL before using discord-notify.",
		});
	});

	test("JIRA example creates an issue payload from the current page", async () => {
		const fetchMock = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ key: "QA-42" }), { status: 201 }),
			),
		);
		globalThis.fetch = fetchMock;
		process.env.BROWSE_JIRA_BASE_URL = "https://example.atlassian.net";
		process.env.BROWSE_JIRA_EMAIL = "qa@example.com";
		process.env.BROWSE_JIRA_API_TOKEN = "token";
		process.env.BROWSE_JIRA_PROJECT_KEY = "QA";

		const { default: plugin } = (await import(
			"../examples/plugins/jira/index.ts"
		)) as ExampleModule;
		const result = await plugin.commands?.[0].handler(
			createContext("https://example.com/settings"),
		);

		expect(result).toEqual({
			ok: true,
			data: "Created JIRA issue QA-42.",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://example.atlassian.net/rest/api/3/issue");
		expect(init.method).toBe("POST");
		expect(init.headers).toMatchObject({
			Authorization: expect.stringContaining("Basic "),
			"Content-Type": "application/json",
		});
		expect(JSON.parse(init.body as string)).toMatchObject({
			fields: {
				project: { key: "QA" },
				summary: "Browse issue for https://example.com/settings",
			},
		});
	});
});
