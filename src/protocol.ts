const VALID_COMMANDS = [
	"goto",
	"text",
	"quit",
	"snapshot",
	"click",
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
] as const;

export type Command = (typeof VALID_COMMANDS)[number];

export type Request = {
	cmd: Command;
	args: string[];
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

	return { cmd: cmd as Command, args: obj.args as string[] };
}

export function serialiseResponse(response: Response): string {
	return `${JSON.stringify(response)}\n`;
}
