const VALID_COMMANDS = [
	"goto",
	"text",
	"quit",
	"snapshot",
	"click",
	"hover",
	"fill",
	"select",
	"screenshot",
	"console",
	"network",
	"auth-state",
	"login",
	"tab",
	"flow",
	"assert",
	"healthcheck",
	"wipe",
	"benchmark",
	"viewport",
	"eval",
	"page-eval",
	"scroll",
	"press",
	"wait",
	"url",
	"back",
	"forward",
	"reload",
	"attr",
	"upload",
	"a11y",
	"session",
	"ping",
	"status",
	"dialog",
	"download",
	"frame",
	"intercept",
	"cookies",
	"storage",
	"html",
	"title",
	"pdf",
	"element-count",
	"trace",
	"init",
	"screenshots",
	"report",
	"completions",
	"form",
	"test-matrix",
	"assert-ai",
	"replay",
	"diff",
	"flow-share",
	"video",
	"perf",
	"security",
	"responsive",
	"extract",
	"record",
	"throttle",
	"offline",
	"crawl",
	"do",
	"vrt",
	"ci-init",
	"watch",
	"repl",
	"seo",
	"subscribe",
	"dev",
	"compliance",
	"security-scan",
	"i18n",
	"api-assert",
	"design-audit",
	"doc-capture",
	"gesture",
	"devices",
	"monitor",
] as const;

export type Command = (typeof VALID_COMMANDS)[number];

/** Set of all built-in command names, for plugin collision checks. */
export const BUILTIN_COMMANDS: ReadonlySet<string> = new Set(VALID_COMMANDS);

export type Request = {
	cmd: Command;
	args: string[];
	timeout?: number;
	/** Optional session name for multi-session routing */
	session?: string;
	/** Request JSON output format */
	json?: boolean;
	/** Authentication token for socket security */
	token?: string;
};

export type Response =
	| { ok: true; data: string }
	| { ok: false; error: string };

export function parseRequest(
	raw: string,
	extraCommands?: ReadonlySet<string>,
): Request {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("Invalid JSON");
	}

	if (
		typeof parsed !== "object" ||
		parsed === null ||
		typeof (parsed as Record<string, unknown>).cmd !== "string"
	) {
		throw new Error("Missing cmd field");
	}

	const obj = parsed as Record<string, unknown>;

	if (!Array.isArray(obj.args)) {
		throw new Error("Missing args field");
	}

	const cmd = obj.cmd as string;
	if (!VALID_COMMANDS.includes(cmd as Command) && !extraCommands?.has(cmd)) {
		throw new Error(`Unknown command: ${cmd}`);
	}

	const timeout =
		typeof obj.timeout === "number" && obj.timeout > 0
			? obj.timeout
			: undefined;

	const rawSession =
		typeof obj.session === "string" ? obj.session.trim() : undefined;
	const session = rawSession && rawSession.length > 0 ? rawSession : undefined;

	const json = obj.json === true;

	const rawToken = typeof obj.token === "string" ? obj.token.trim() : undefined;
	const tokenVal = rawToken && rawToken.length > 0 ? rawToken : undefined;

	return {
		cmd: cmd as Command,
		args: obj.args as string[],
		timeout,
		session,
		json,
		token: tokenVal,
	};
}

export function serialiseResponse(response: Response): string {
	return `${JSON.stringify(response)}\n`;
}
