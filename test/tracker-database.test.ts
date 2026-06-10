import { describe, expect, test } from "bun:test";
import { classifyCookie, classifyDomain } from "../src/tracker-database.ts";

describe("classifyCookie", () => {
	test("matches known tracker cookies exactly", () => {
		expect(classifyCookie("_ga")?.tracker).toBe("Google Analytics");
		expect(classifyCookie("fr")?.tracker).toBe("Facebook");
		expect(classifyCookie("IDE")?.tracker).toBe("Google DoubleClick");
	});

	test("matches dynamic-suffix cookies by prefix", () => {
		expect(classifyCookie("_ga_ABC123")?.tracker).toBe("Google Analytics");
		expect(classifyCookie("_hjSessionUser_1")?.tracker).toBe("Hotjar");
		expect(classifyCookie("_gcl_dc")?.tracker).toBe("Google Ads Conversion");
	});

	test("does not misclassify first-party cookies sharing a short prefix", () => {
		expect(classifyCookie("front_session")).toBeNull();
		expect(classifyCookie("fresh_token")).toBeNull();
		expect(classifyCookie("IDENTITY")).toBeNull();
		expect(classifyCookie("DSID_custom")).toBeNull();
	});
});

describe("classifyDomain", () => {
	test("matches tracker domains and subdomains", () => {
		expect(
			classifyDomain("https://www.google-analytics.com/collect")?.tracker,
		).toBe("Google Analytics");
		expect(classifyDomain("https://sub.doubleclick.net/x")?.tracker).toBe(
			"Google DoubleClick",
		);
	});

	test("does not match lookalike domains", () => {
		expect(classifyDomain("https://notdoubleclick.net/x")).toBeNull();
	});

	test("returns null for invalid URLs", () => {
		expect(classifyDomain("not-a-url")).toBeNull();
	});
});
