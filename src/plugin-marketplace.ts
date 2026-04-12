export type MarketplacePlugin = {
	name: string;
	description?: string;
	keywords?: string[];
	version?: string;
	links?: {
		npm?: string;
		repository?: string;
	};
};

const MARKETPLACE_KEYWORD = "browse-plugin";

export function buildMarketplaceSearchUrl(
	query: string,
	page = 1,
	size = 20,
): string {
	const from = Math.max(0, (page - 1) * size);
	const search = query.trim().replace(/\s+/g, " ");
	const text = `keywords:${MARKETPLACE_KEYWORD}${search ? ` ${search}` : ""}`;
	const params = new URLSearchParams({
		text,
		size: String(size),
		from: String(from),
	});
	return `https://registry.npmjs.org/-/v1/search?${params.toString().replace(/\+/g, "%20")}`;
}

export function filterMarketplacePlugins(
	plugins: MarketplacePlugin[],
): MarketplacePlugin[] {
	return plugins
		.filter((plugin) => {
			if (plugin.name.startsWith("browse-plugin-")) {
				return true;
			}
			return (plugin.keywords ?? []).includes(MARKETPLACE_KEYWORD);
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}
