import { Buffer } from "node:buffer";
import type { BrowsePlugin } from "../../../src/plugin.ts";

type JiraConfig = {
	baseUrl: string;
	email: string;
	apiToken: string;
	projectKey: string;
	issueType: string;
};

function readJiraConfig(): JiraConfig | string {
	const baseUrl = process.env.BROWSE_JIRA_BASE_URL?.replace(/\/$/, "");
	const email = process.env.BROWSE_JIRA_EMAIL;
	const apiToken = process.env.BROWSE_JIRA_API_TOKEN;
	const projectKey = process.env.BROWSE_JIRA_PROJECT_KEY;
	const issueType = process.env.BROWSE_JIRA_ISSUE_TYPE ?? "Task";

	if (!baseUrl || !email || !apiToken || !projectKey) {
		return "Set BROWSE_JIRA_BASE_URL, BROWSE_JIRA_EMAIL, BROWSE_JIRA_API_TOKEN, and BROWSE_JIRA_PROJECT_KEY before using jira-create.";
	}

	return { baseUrl, email, apiToken, projectKey, issueType };
}

function buildDescription(pageUrl: string) {
	const lines = ["Created by Browse."];
	if (pageUrl && pageUrl !== "about:blank") {
		lines.push(`Current page: ${pageUrl}`);
	}

	return {
		type: "doc",
		version: 1,
		content: lines.map((line) => ({
			type: "paragraph",
			content: [{ type: "text", text: line }],
		})),
	};
}

const plugin: BrowsePlugin = {
	name: "browse-plugin-jira",
	version: "0.1.0",
	commands: [
		{
			name: "jira-create",
			summary: "Create a JIRA issue for the current page",
			usage: `browse jira-create [summary...] [--json]

Environment:
  BROWSE_JIRA_BASE_URL      Atlassian site URL
  BROWSE_JIRA_EMAIL         Atlassian account email
  BROWSE_JIRA_API_TOKEN     Atlassian API token
  BROWSE_JIRA_PROJECT_KEY   Project key
  BROWSE_JIRA_ISSUE_TYPE    Optional issue type (default: Task)

Examples:
  browse jira-create
  browse jira-create Broken settings page`,
			flags: ["--json"],
			handler: async (ctx) => {
				const config = readJiraConfig();
				if (typeof config === "string") {
					return { ok: false, error: config };
				}

				const pageUrl = ctx.page.url();
				const summary =
					ctx.args.join(" ").trim() ||
					(pageUrl && pageUrl !== "about:blank"
						? `Browse issue for ${pageUrl}`
						: "Browse issue");
				const response = await fetch(`${config.baseUrl}/rest/api/3/issue`, {
					method: "POST",
					headers: {
						Authorization: `Basic ${Buffer.from(
							`${config.email}:${config.apiToken}`,
						).toString("base64")}`,
						Accept: "application/json",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						fields: {
							project: { key: config.projectKey },
							issuetype: { name: config.issueType },
							summary,
							description: buildDescription(pageUrl),
						},
					}),
				});

				if (!response.ok) {
					return {
						ok: false,
						error: `JIRA issue creation failed with status ${response.status}.`,
					};
				}

				let body: { key?: string };
				try {
					body = (await response.json()) as { key?: string };
				} catch {
					return { ok: false, error: "JIRA returned invalid JSON." };
				}

				if (!body.key) {
					return {
						ok: false,
						error: "JIRA response did not include an issue key.",
					};
				}

				if (ctx.request.json) {
					return {
						ok: true,
						data: JSON.stringify({ key: body.key, summary, pageUrl }, null, 2),
					};
				}

				return { ok: true, data: `Created JIRA issue ${body.key}.` };
			},
		},
	],
};

export default plugin;
