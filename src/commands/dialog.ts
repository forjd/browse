import type { Dialog, Page } from "playwright";
import type { Response } from "../protocol.ts";

export type DialogState = {
	pending: Dialog | null;
	autoMode: "accept" | "dismiss" | "none";
};

export function createDialogState(): DialogState {
	return { pending: null, autoMode: "none" };
}

export function attachDialogListener(page: Page, state: DialogState): void {
	page.on("dialog", (dialog) => {
		if (state.autoMode === "accept") {
			dialog.accept();
		} else if (state.autoMode === "dismiss") {
			dialog.dismiss();
		} else {
			state.pending = dialog;
		}
	});
}

export async function handleDialog(
	state: DialogState,
	args: string[],
): Promise<Response> {
	const subcommand = args[0];

	if (!subcommand) {
		return {
			ok: false,
			error:
				"Usage: browse dialog <accept|dismiss|status|auto-accept|auto-dismiss|auto-off>",
		};
	}

	switch (subcommand) {
		case "accept": {
			if (!state.pending) {
				return { ok: false, error: "No pending dialog." };
			}
			const text = args[1];
			await state.pending.accept(text);
			const msg = state.pending.message();
			state.pending = null;
			return { ok: true, data: `Dialog accepted: "${msg}"` };
		}
		case "dismiss": {
			if (!state.pending) {
				return { ok: false, error: "No pending dialog." };
			}
			const msg = state.pending.message();
			await state.pending.dismiss();
			state.pending = null;
			return { ok: true, data: `Dialog dismissed: "${msg}"` };
		}
		case "status": {
			if (state.pending) {
				return {
					ok: true,
					data: `Pending ${state.pending.type()} dialog: "${state.pending.message()}"`,
				};
			}
			return {
				ok: true,
				data: `No pending dialog. Auto-mode: ${state.autoMode}`,
			};
		}
		case "auto-accept":
			state.autoMode = "accept";
			return { ok: true, data: "Dialog auto-mode set to accept." };
		case "auto-dismiss":
			state.autoMode = "dismiss";
			return { ok: true, data: "Dialog auto-mode set to dismiss." };
		case "auto-off":
			state.autoMode = "none";
			return { ok: true, data: "Dialog auto-mode disabled." };
		default:
			return {
				ok: false,
				error: `Unknown dialog subcommand: ${subcommand}. Use accept, dismiss, status, auto-accept, auto-dismiss, or auto-off.`,
			};
	}
}
