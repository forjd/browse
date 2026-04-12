import { describe, expect, test } from "bun:test";
import {
	findOfficialPlugin,
	OFFICIAL_PLUGINS,
} from "../src/official-plugins.ts";

describe("official plugins", () => {
	test("lists core first-party integrations", () => {
		expect(OFFICIAL_PLUGINS.map((p) => p.slug)).toEqual([
			"slack",
			"discord",
			"jira",
		]);
	});

	test("finds plugin by slug", () => {
		expect(findOfficialPlugin("jira")?.packageName).toBe("@browse/plugin-jira");
		expect(findOfficialPlugin("unknown")).toBeUndefined();
	});
});
