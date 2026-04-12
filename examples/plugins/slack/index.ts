import type { BrowsePlugin } from "../../../src/plugin.ts";

function buildSlackMessage(message: string | undefined, url: string): string {
	if (message) {
		return message;
	}

	return url && url !== "about:blank"
		? `Browse run update: ${url}`
		: "Browse run update";
}

const plugin: BrowsePlugin = {
	name: "browse-plugin-slack",
	version: "0.1.0",
	commands: [
		{
			name: "slack-notify",
			summary: "Send a message to a Slack webhook",
			usage: `browse slack-notify [message...] [--json]

Environment:
  BROWSE_SLACK_WEBHOOK_URL   Incoming webhook URL

Examples:
  browse slack-notify
  browse slack-notify Deployment finished`,
			flags: ["--json"],
			handler: async (ctx) => {
				const webhookUrl = process.env.BROWSE_SLACK_WEBHOOK_URL;
				if (!webhookUrl) {
					return {
						ok: false,
						error: "Set BROWSE_SLACK_WEBHOOK_URL before using slack-notify.",
					};
				}

				const message = buildSlackMessage(
					ctx.args.join(" ").trim() || undefined,
					ctx.page.url(),
				);
				const response = await fetch(webhookUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ text: message }),
				});

				if (!response.ok) {
					return {
						ok: false,
						error: `Slack webhook failed with status ${response.status}.`,
					};
				}

				if (ctx.request.json) {
					return {
						ok: true,
						data: JSON.stringify({ webhookUrl, message }, null, 2),
					};
				}

				return { ok: true, data: "Sent Slack notification." };
			},
		},
	],
};

export default plugin;
