export type OfficialPlugin = {
	slug: string;
	name: string;
	packageName: string;
	description: string;
	docsUrl: string;
};

export const OFFICIAL_PLUGINS: OfficialPlugin[] = [
	{
		slug: "slack",
		name: "Slack Notifications",
		packageName: "@browse/plugin-slack",
		description: "Send flow and healthcheck notifications to Slack channels.",
		docsUrl: "https://github.com/forjd/browse/tree/main/examples/plugins/slack",
	},
	{
		slug: "discord",
		name: "Discord Notifications",
		packageName: "@browse/plugin-discord",
		description: "Send automation run summaries to Discord webhooks.",
		docsUrl:
			"https://github.com/forjd/browse/tree/main/examples/plugins/discord",
	},
	{
		slug: "jira",
		name: "JIRA Issue Sync",
		packageName: "@browse/plugin-jira",
		description: "Create and update JIRA issues from failed Browse runs.",
		docsUrl: "https://github.com/forjd/browse/tree/main/examples/plugins/jira",
	},
];

export function findOfficialPlugin(slug: string): OfficialPlugin | undefined {
	return OFFICIAL_PLUGINS.find((plugin) => plugin.slug === slug);
}
