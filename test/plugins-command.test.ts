import { describe, expect, mock, test } from "bun:test";
import { handlePluginsCommand } from "../src/plugins-command.ts";

describe("plugins command", () => {
	test("lists official plugins in text output", async () => {
		const result = await handlePluginsCommand(["official"]);
		expect(result).toEqual({
			ok: true,
			data: expect.stringContaining("@browse/plugin-slack"),
		});
		if (result.ok) {
			expect(result.data).toContain("@browse/plugin-discord");
			expect(result.data).toContain("@browse/plugin-jira");
		}
	});

	test("lists official plugins in JSON output", async () => {
		const result = await handlePluginsCommand(["official"], { json: true });
		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		const parsed = JSON.parse(result.data);
		expect(parsed.plugins).toHaveLength(3);
		expect(parsed.plugins[0].slug).toBe("slack");
	});

	test("searches the npm marketplace for community plugins", async () => {
		const fetchMock = mock((input: string | URL | Request) => {
			expect(String(input)).toBe(
				"https://registry.npmjs.org/-/v1/search?text=keywords%3Abrowse-plugin%20slack&size=10&from=0",
			);
			return Promise.resolve(
				new Response(
					JSON.stringify({
						objects: [
							{
								package: {
									name: "browse-plugin-slack-alerts",
									description: "Post Browse results to Slack.",
									keywords: ["browse-plugin"],
									version: "1.2.3",
									links: {
										npm: "https://npmjs.com/package/browse-plugin-slack-alerts",
										repository:
											"https://github.com/acme/browse-plugin-slack-alerts",
									},
								},
							},
						],
					}),
					{ status: 200 },
				),
			);
		});

		const result = await handlePluginsCommand(
			["search", "slack", "--limit", "10"],
			{
				fetchImpl: fetchMock as typeof fetch,
			},
		);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.data).toContain("browse-plugin-slack-alerts");
		expect(result.data).toContain("1.2.3");
		expect(result.data).toContain(
			"https://github.com/acme/browse-plugin-slack-alerts",
		);
	});

	test("returns usage when the subcommand is missing", async () => {
		const result = await handlePluginsCommand([]);
		expect(result).toEqual({
			ok: false,
			error:
				"Usage: browse plugins <official|search [query...]> [--page <n>] [--limit <n>]",
		});
	});

	test("returns a helpful error when marketplace search fails", async () => {
		const fetchMock = mock(() =>
			Promise.resolve(new Response("Server Error", { status: 503 })),
		);

		const result = await handlePluginsCommand(["search", "slack"], {
			fetchImpl: fetchMock as typeof fetch,
		});

		expect(result).toEqual({
			ok: false,
			error: "Plugin marketplace request failed with status 503.",
		});
	});
});
