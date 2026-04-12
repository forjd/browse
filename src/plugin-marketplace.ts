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

type MarketplaceSearchResponse = {
	objects?: Array<{
		package?: MarketplacePlugin;
	}>;
};

export async function searchMarketplacePlugins(
	query: string,
	page = 1,
	size = 20,
	fetchImpl: typeof fetch = fetch,
): Promise<MarketplacePlugin[]> {
	const response = await fetchImpl(
		buildMarketplaceSearchUrl(query, page, size),
		{
			headers: {
				Accept: "application/json",
			},
		},
	);

	if (!response.ok) {
		throw new Error(
			`Plugin marketplace request failed with status ${response.status}.`,
		);
	}

	let body: MarketplaceSearchResponse;
	try {
		body = (await response.json()) as MarketplaceSearchResponse;
	} catch {
		throw new Error("Plugin marketplace returned invalid JSON.");
	}

	const packages = Array.isArray(body.objects)
		? body.objects
				.flatMap((entry) => (entry?.package ? [entry.package] : []))
				.map((plugin) => ({
					name: plugin.name,
					description: plugin.description,
					keywords: plugin.keywords,
					version: plugin.version,
					links: plugin.links,
				}))
		: [];

	return filterMarketplacePlugins(packages);
}
