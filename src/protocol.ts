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

export type BatchCommandRequest = {
	cmd: Command;
	args: string[];
	timeout?: number;
	session?: string;
	json?: boolean;
};

export type BatchRequest = {
	batch: BatchCommandRequest[];
	continueOnError?: boolean;
	timeout?: number;
	session?: string;
	json?: boolean;
	token?: string;
};

export type Response =
	| { ok: true; data: string }
	| { ok: false; error: string };

export type BatchItemResponse =
	| { cmd: string; ok: true; data: string }
	| { cmd: string; ok: false; error: string };

export type BatchResponse = {
	ok: true;
	batch: BatchItemResponse[];
	stoppedEarly?: boolean;
};

export type ProtocolResponse = Response | BatchResponse;

function parseCommonFields(obj: Record<string, unknown>): {
	timeout: number | undefined;
	session: string | undefined;
	json: boolean;
	token: string | undefined;
} {
	const timeout =
		typeof obj.timeout === "number" && obj.timeout > 0
			? obj.timeout
			: undefined;

	const rawSession =
		typeof obj.session === "string" ? obj.session.trim() : undefined;
	const session = rawSession && rawSession.length > 0 ? rawSession : undefined;

	const json = obj.json === true;

	const rawToken = typeof obj.token === "string" ? obj.token.trim() : undefined;
	const token = rawToken && rawToken.length > 0 ? rawToken : undefined;

	return { timeout, session, json, token };
}

function parseCommandRequest(
	obj: Record<string, unknown>,
	extraCommands?: ReadonlySet<string>,
): Request {
	if (typeof obj.cmd !== "string") {
		throw new Error("Missing cmd field");
	}

	if (!Array.isArray(obj.args)) {
		throw new Error("Missing args field");
	}

	const cmd = obj.cmd as string;
	if (!VALID_COMMANDS.includes(cmd as Command) && !extraCommands?.has(cmd)) {
		throw new Error(`Unknown command: ${cmd}`);
	}

	const common = parseCommonFields(obj);

	return {
		cmd: cmd as Command,
		args: obj.args as string[],
		timeout: common.timeout,
		session: common.session,
		json: common.json,
		token: common.token,
	};
}

export function parseRequest(
	raw: string,
	extraCommands?: ReadonlySet<string>,
): Request | BatchRequest {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("Invalid JSON");
	}

	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("Missing cmd field");
	}

	const obj = parsed as Record<string, unknown>;

	if (Array.isArray(obj.batch)) {
		const common = parseCommonFields(obj);
		const batch = obj.batch.map((entry) => {
			if (typeof entry !== "object" || entry === null) {
				throw new Error("Invalid batch entry");
			}
			const parsedEntry = parseCommandRequest(
				entry as Record<string, unknown>,
				extraCommands,
			);
			return {
				cmd: parsedEntry.cmd,
				args: parsedEntry.args,
				timeout: parsedEntry.timeout,
				session: parsedEntry.session,
				json: parsedEntry.json,
			};
		});

		return {
			batch,
			continueOnError: obj.continueOnError === true,
			timeout: common.timeout,
			session: common.session,
			json: common.json,
			token: common.token,
		};
	}

	return parseCommandRequest(obj, extraCommands);
}

export function isBatchRequest(
	request: Request | BatchRequest,
): request is BatchRequest {
	return "batch" in request;
}

export function isBatchResponse(
	response: ProtocolResponse,
): response is BatchResponse {
	return "batch" in response;
}

export function serialiseResponse(response: ProtocolResponse): string {
	return `${JSON.stringify(response)}\n`;
}
