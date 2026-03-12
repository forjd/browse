import type { Response } from "../protocol.ts";

export async function handleQuit(): Promise<Response> {
	return { ok: true, data: "Daemon stopped." };
}
