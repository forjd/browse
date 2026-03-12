import type { RingBuffer } from "../buffers.ts";
import type { Response } from "../protocol.ts";

export type NetworkEntry = {
	status: number;
	method: string;
	url: string;
	timestamp: number;
};

function formatNetworkEntries(entries: NetworkEntry[]): string {
	return entries
		.map((entry) => `[${entry.status}] ${entry.method} ${entry.url}`)
		.join("\n");
}

export function handleNetwork(
	buffer: RingBuffer<NetworkEntry>,
	args: string[],
): Response {
	let all = false;
	let keep = false;

	for (const arg of args) {
		if (arg === "--all") all = true;
		if (arg === "--keep") keep = true;
	}

	const filter = all ? undefined : (entry: NetworkEntry) => entry.status >= 400;

	const entries = keep ? buffer.peek(filter) : buffer.drain(filter);

	if (entries.length === 0) {
		return { ok: true, data: all ? "No requests." : "No failed requests." };
	}

	return { ok: true, data: formatNetworkEntries(entries) };
}
