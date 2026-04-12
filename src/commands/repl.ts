import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleRepl(
	_page: Page,
	_args: string[],
): Promise<Response> {
	// REPL requires an interactive terminal — the daemon serves single
	// request/response pairs over its socket, so the REPL is implemented
	// in the CLI binary instead.  This handler exists so the command is
	// registered and can be dispatched, but it returns guidance.
	return {
		ok: true,
		data: `Interactive REPL mode.\n\nThe REPL provides an interactive session with:\n  - Command history and tab completion\n  - Auto-snapshot after navigation\n  - .save <path> — export session history as a flow file\n  - .history — show command history\n  - .undo — navigate back\n  - exit or Ctrl+D to quit\n\nNote: REPL mode requires an interactive terminal. Use the browse CLI directly in your terminal for the full REPL experience.`,
	};
}
