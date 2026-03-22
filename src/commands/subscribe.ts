import type { Page } from "playwright";
import type { Response } from "../protocol.ts";

export async function handleSubscribe(
	page: Page,
	args: string[],
): Promise<Response> {
	// Parse --events flag
	const eventsIdx = args.indexOf("--events");
	const eventTypes =
		eventsIdx !== -1 && eventsIdx + 1 < args.length
			? args[eventsIdx + 1].split(",")
			: ["navigation", "console", "network"];

	const validEvents = new Set([
		"navigation",
		"console",
		"network",
		"dialog",
		"download",
		"error",
	]);

	for (const ev of eventTypes) {
		if (!validEvents.has(ev)) {
			return {
				ok: false,
				error: `Unknown event type: "${ev}". Valid types: ${[...validEvents].join(", ")}`,
			};
		}
	}

	// Parse --level filter
	const levelIdx = args.indexOf("--level");
	const levelFilter =
		levelIdx !== -1 && levelIdx + 1 < args.length
			? args[levelIdx + 1]
			: undefined;

	// Parse --status filter
	const statusIdx = args.indexOf("--status");
	const statusFilter =
		statusIdx !== -1 && statusIdx + 1 < args.length
			? args[statusIdx + 1]
			: undefined;

	// Parse --idle-timeout
	const idleIdx = args.indexOf("--idle-timeout");
	const idleTimeout =
		idleIdx !== -1 && idleIdx + 1 < args.length
			? Number.parseInt(args[idleIdx + 1], 10) * 1000
			: 60_000;

	// Collect events for the configured timeout window
	const events: string[] = [];

	// Track listeners for guaranteed cleanup
	const listeners: (() => void)[] = [];

	const addEvent = (event: Record<string, unknown>) => {
		events.push(JSON.stringify(event));
	};

	if (eventTypes.includes("console")) {
		const handler = (msg: {
			type: () => string;
			text: () => string;
			location: () => { url: string; lineNumber: number };
		}) => {
			const level = msg.type();
			if (levelFilter && level !== levelFilter) return;
			addEvent({
				ts: new Date().toISOString(),
				event: "console",
				data: {
					level,
					text: msg.text(),
					source: msg.location().url,
					line: msg.location().lineNumber,
				},
			});
		};
		page.on("console", handler);
		listeners.push(() => page.off("console", handler));
	}

	if (eventTypes.includes("navigation")) {
		const handler = (frame: { url: () => string }) => {
			if (frame === page.mainFrame()) {
				addEvent({
					ts: new Date().toISOString(),
					event: "navigation",
					data: { url: frame.url() },
				});
			}
		};
		page.on("framenavigated", handler);
		listeners.push(() => page.off("framenavigated", handler));
	}

	if (eventTypes.includes("dialog")) {
		const handler = (dialog: { type: () => string; message: () => string }) => {
			addEvent({
				ts: new Date().toISOString(),
				event: "dialog",
				data: { type: dialog.type(), message: dialog.message() },
			});
		};
		page.on("dialog", handler);
		listeners.push(() => page.off("dialog", handler));
	}

	if (eventTypes.includes("error")) {
		const handler = (error: Error) => {
			addEvent({
				ts: new Date().toISOString(),
				event: "error",
				data: {
					message: error.message,
					stack: error.stack,
				},
			});
		};
		page.on("pageerror", handler);
		listeners.push(() => page.off("pageerror", handler));
	}

	// Collect for a short window (max 5 seconds) to capture pending events
	const collectTime = Math.min(idleTimeout, 5_000);
	try {
		await new Promise<void>((resolve) => {
			setTimeout(resolve, collectTime);
		});
	} finally {
		// Always clean up listeners to prevent accumulation
		for (const cleanup of listeners) cleanup();
	}

	if (events.length === 0) {
		return {
			ok: true,
			data: `Subscribed to [${eventTypes.join(", ")}] — no events captured in window.\nFor continuous streaming, use the browse CLI in a long-running process.`,
		};
	}

	return {
		ok: true,
		data: events.join("\n"),
	};
}
