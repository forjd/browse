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
] as const;

export type Command = (typeof VALID_COMMANDS)[number];

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

export function parseRequest(raw: string): Request {
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
	if (!VALID_COMMANDS.includes(cmd as Command)) {
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
