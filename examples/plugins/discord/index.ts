import type { BrowsePlugin } from "../../../src/plugin.ts";

function buildDiscordMessage(message: string | undefined, url: string): string {
	if (message) {
		return message;
	}

	return url && url !== "about:blank"
		? `Browse run update: ${url}`
		: "Browse run update";
}

const plugin: BrowsePlugin = {
	name: "browse-plugin-discord",
	version: "0.1.0",
	commands: [
		{
			name: "discord-notify",
			summary: "Send a message to a Discord webhook",
			usage: `browse discord-notify [message...] [--json]

Environment:
  BROWSE_DISCORD_WEBHOOK_URL   Discord webhook URL

Examples:
  browse discord-notify
  browse discord-notify Deployment finished`,
			flags: ["--json"],
			handler: async (ctx) => {
				const webhookUrl = process.env.BROWSE_DISCORD_WEBHOOK_URL;
				if (!webhookUrl) {
					return {
						ok: false,
						error:
							"Set BROWSE_DISCORD_WEBHOOK_URL before using discord-notify.",
					};
				}

				const message = buildDiscordMessage(
					ctx.args.join(" ").trim() || undefined,
					ctx.page.url(),
				);
				const response = await fetch(webhookUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ content: message }),
				});

				if (!response.ok) {
					return {
						ok: false,
						error: `Discord webhook failed with status ${response.status}.`,
					};
				}

				if (ctx.request.json) {
					return {
						ok: true,
						data: JSON.stringify({ webhookUrl, message }, null, 2),
					};
				}

				return { ok: true, data: "Sent Discord notification." };
			},
		},
	],
};

export default plugin;
