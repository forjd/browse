export type OfficialPlugin = {
	slug: string;
	name: string;
	packageName: string;
	sourcePath: string;
	description: string;
	docsUrl: string;
};

export const OFFICIAL_PLUGINS: OfficialPlugin[] = [
	{
		slug: "slack",
		name: "Slack Notifications",
		packageName: "@browse/plugin-slack",
		sourcePath: "./examples/plugins/slack/index.ts",
		description:
			"Send the current page or a custom message to a Slack webhook.",
		docsUrl: "https://github.com/forjd/browse/tree/main/examples/plugins/slack",
	},
	{
		slug: "discord",
		name: "Discord Notifications",
		packageName: "@browse/plugin-discord",
		sourcePath: "./examples/plugins/discord/index.ts",
		description:
			"Send the current page or a custom message to a Discord webhook.",
		docsUrl:
			"https://github.com/forjd/browse/tree/main/examples/plugins/discord",
	},
	{
		slug: "jira",
		name: "JIRA Issue Sync",
		packageName: "@browse/plugin-jira",
		sourcePath: "./examples/plugins/jira/index.ts",
		description:
			"Create a JIRA issue for the current page with Browse context.",
		docsUrl: "https://github.com/forjd/browse/tree/main/examples/plugins/jira",
	},
];

export function findOfficialPlugin(slug: string): OfficialPlugin | undefined {
	return OFFICIAL_PLUGINS.find((plugin) => plugin.slug === slug);
}
