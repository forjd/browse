/**
 * Known tracking cookies and domains for compliance auditing.
 */

export type TrackerCategory =
	| "analytics"
	| "advertising"
	| "social"
	| "functional";

export const TRACKER_COOKIES: Record<
	string,
	{ name: string; category: TrackerCategory }
> = {
	_ga: { name: "Google Analytics", category: "analytics" },
	_gid: { name: "Google Analytics", category: "analytics" },
	_gat: { name: "Google Analytics", category: "analytics" },
	_fbp: { name: "Facebook Pixel", category: "advertising" },
	_fbc: { name: "Facebook Pixel", category: "advertising" },
	_hjid: { name: "Hotjar", category: "analytics" },
	_hjFirstSeen: { name: "Hotjar", category: "analytics" },
	_hjAbsoluteSessionInProgress: { name: "Hotjar", category: "analytics" },
	_uetsid: { name: "Microsoft Ads", category: "advertising" },
	_uetvid: { name: "Microsoft Ads", category: "advertising" },
	IDE: { name: "Google DoubleClick", category: "advertising" },
	DSID: { name: "Google DoubleClick", category: "advertising" },
	"1P_JAR": { name: "Google Ads", category: "advertising" },
	_gcl_au: { name: "Google Ads Conversion", category: "advertising" },
	_gcl_aw: { name: "Google Ads Conversion", category: "advertising" },
	fr: { name: "Facebook", category: "social" },
	_pin_unauth: { name: "Pinterest", category: "social" },
	_tt_enable_cookie: { name: "TikTok", category: "advertising" },
	_ttp: { name: "TikTok", category: "advertising" },
};

export const TRACKER_DOMAINS: Record<
	string,
	{ name: string; category: TrackerCategory }
> = {
	"google-analytics.com": { name: "Google Analytics", category: "analytics" },
	"googletagmanager.com": {
		name: "Google Tag Manager",
		category: "analytics",
	},
	"facebook.net": { name: "Facebook", category: "advertising" },
	"connect.facebook.net": { name: "Facebook SDK", category: "advertising" },
	"hotjar.com": { name: "Hotjar", category: "analytics" },
	"clarity.ms": { name: "Microsoft Clarity", category: "analytics" },
	"doubleclick.net": { name: "Google DoubleClick", category: "advertising" },
	"googlesyndication.com": {
		name: "Google AdSense",
		category: "advertising",
	},
	"googleadservices.com": { name: "Google Ads", category: "advertising" },
	"analytics.tiktok.com": { name: "TikTok Analytics", category: "analytics" },
	"snap.licdn.com": { name: "LinkedIn Insight", category: "analytics" },
	"bat.bing.com": { name: "Bing Ads", category: "advertising" },
	"ads.twitter.com": { name: "Twitter Ads", category: "advertising" },
	"t.co": { name: "Twitter", category: "social" },
};

export function classifyCookie(
	name: string,
): { tracker: string; category: TrackerCategory } | null {
	// Direct match
	if (TRACKER_COOKIES[name]) {
		return {
			tracker: TRACKER_COOKIES[name].name,
			category: TRACKER_COOKIES[name].category,
		};
	}

	// Prefix match (e.g., _ga_XXXXX)
	for (const [prefix, info] of Object.entries(TRACKER_COOKIES)) {
		if (name.startsWith(prefix)) {
			return { tracker: info.name, category: info.category };
		}
	}

	return null;
}

export function classifyDomain(
	url: string,
): { tracker: string; category: TrackerCategory } | null {
	try {
		const hostname = new URL(url).hostname;
		for (const [domain, info] of Object.entries(TRACKER_DOMAINS)) {
			if (hostname === domain || hostname.endsWith(`.${domain}`)) {
				return { tracker: info.name, category: info.category };
			}
		}
	} catch {
		// Invalid URL
	}
	return null;
}
