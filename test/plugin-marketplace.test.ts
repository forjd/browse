import { describe, expect, test } from "bun:test";
import {
	buildMarketplaceSearchUrl,
	filterMarketplacePlugins,
	type MarketplacePlugin,
} from "../src/plugin-marketplace.ts";

describe("plugin marketplace", () => {
	test("builds npm keyword search URL", () => {
		const url = buildMarketplaceSearchUrl("slack bot", 2, 15);
		expect(url).toBe(
			"https://registry.npmjs.org/-/v1/search?text=keywords%3Abrowse-plugin%20slack%20bot&size=15&from=15",
		);
	});

	test("filters to browse-compatible plugins", () => {
		const plugins: MarketplacePlugin[] = [
			{ name: "browse-plugin-slack", keywords: ["browse-plugin"] },
			{ name: "not-related", keywords: ["foo"] },
			{ name: "browse-plugin-jira", keywords: ["browse-plugin", "browse"] },
		];

		expect(filterMarketplacePlugins(plugins).map((p) => p.name)).toEqual([
			"browse-plugin-jira",
			"browse-plugin-slack",
		]);
	});
});
