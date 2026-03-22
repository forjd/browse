import type { Page } from "playwright";
import type { Response } from "../protocol.ts";
import { resolveRef } from "../refs.ts";

export async function handleGesture(
	page: Page,
	args: string[],
): Promise<Response> {
	if (args.length === 0) {
		return {
			ok: false,
			error: `Usage: browse gesture <type> [args]

Types:
  swipe <direction> [@ref]   Swipe left/right/up/down
  long-press <@ref>          Long press an element
  double-tap <@ref>          Double tap an element
  drag <@ref> --to <@ref>    Drag element to another

Flags:
  --speed <fast|slow>    Swipe speed (default: normal)
  --duration <ms>        Long press duration (default: 500)
  --distance <px>        Swipe distance (default: 200)`,
		};
	}

	const gestureType = args[0];
	const subArgs = args.slice(1);

	switch (gestureType) {
		case "swipe":
			return handleSwipe(page, subArgs);
		case "long-press":
			return handleLongPress(page, subArgs);
		case "double-tap":
			return handleDoubleTap(page, subArgs);
		case "drag":
			return handleDrag(page, subArgs);
		default:
			return {
				ok: false,
				error: `Unknown gesture type: "${gestureType}". Use: swipe, long-press, double-tap, drag`,
			};
	}
}

async function handleSwipe(page: Page, args: string[]): Promise<Response> {
	const direction = args[0];
	if (!direction || !["left", "right", "up", "down"].includes(direction)) {
		return {
			ok: false,
			error:
				"Usage: browse gesture swipe <left|right|up|down> [@ref] [--distance N]",
		};
	}

	const distIdx = args.indexOf("--distance");
	const distance =
		distIdx !== -1 && distIdx + 1 < args.length
			? Number.parseInt(args[distIdx + 1], 10)
			: 200;

	const speedIdx = args.indexOf("--speed");
	const speed =
		speedIdx !== -1 && speedIdx + 1 < args.length
			? args[speedIdx + 1]
			: "normal";

	const steps = speed === "slow" ? 20 : speed === "fast" ? 5 : 10;

	// Get start position (center of viewport or element)
	let startX: number;
	let startY: number;

	const refArg = args.find((a) => a.startsWith("@"));
	if (refArg) {
		const resolved = resolveRef(refArg);
		if ("error" in resolved) {
			return { ok: false, error: resolved.error };
		}
		const locator = page.getByRole(
			resolved.role as Parameters<typeof page.getByRole>[0],
			{ name: resolved.name, exact: true },
		);
		const box = await locator.boundingBox();
		if (!box) {
			return { ok: false, error: `Could not find bounding box for ${refArg}` };
		}
		startX = box.x + box.width / 2;
		startY = box.y + box.height / 2;
	} else {
		const viewport = page.viewportSize();
		startX = (viewport?.width ?? 1440) / 2;
		startY = (viewport?.height ?? 900) / 2;
	}

	let endX = startX;
	let endY = startY;

	switch (direction) {
		case "left":
			endX = startX - distance;
			break;
		case "right":
			endX = startX + distance;
			break;
		case "up":
			endY = startY - distance;
			break;
		case "down":
			endY = startY + distance;
			break;
	}

	try {
		// Use touchscreen API
		await page.touchscreen.tap(startX, startY);
		// Simulate swipe with mouse drag as fallback
		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.mouse.move(endX, endY, { steps });
		await page.mouse.up();

		return {
			ok: true,
			data: `Swiped ${direction} from (${Math.round(startX)},${Math.round(startY)}) to (${Math.round(endX)},${Math.round(endY)})`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `Swipe failed: ${message}` };
	}
}

async function handleLongPress(page: Page, args: string[]): Promise<Response> {
	const ref = args[0];
	if (!ref || !ref.startsWith("@")) {
		return {
			ok: false,
			error: "Usage: browse gesture long-press <@ref> [--duration ms]",
		};
	}

	const durIdx = args.indexOf("--duration");
	const duration =
		durIdx !== -1 && durIdx + 1 < args.length
			? Number.parseInt(args[durIdx + 1], 10)
			: 500;

	const resolved = resolveRef(ref);
	if ("error" in resolved) {
		return { ok: false, error: resolved.error };
	}

	try {
		const locator = page.getByRole(
			resolved.role as Parameters<typeof page.getByRole>[0],
			{ name: resolved.name, exact: true },
		);
		const box = await locator.boundingBox();
		if (!box) {
			return { ok: false, error: `Could not find bounding box for ${ref}` };
		}

		const x = box.x + box.width / 2;
		const y = box.y + box.height / 2;

		await page.mouse.move(x, y);
		await page.mouse.down();
		await new Promise((r) => setTimeout(r, duration));
		await page.mouse.up();

		return {
			ok: true,
			data: `Long pressed ${ref} [${resolved.role}] "${resolved.name}" for ${duration}ms`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `Long press failed: ${message}` };
	}
}

async function handleDoubleTap(page: Page, args: string[]): Promise<Response> {
	const ref = args[0];
	if (!ref || !ref.startsWith("@")) {
		return {
			ok: false,
			error: "Usage: browse gesture double-tap <@ref>",
		};
	}

	const resolved = resolveRef(ref);
	if ("error" in resolved) {
		return { ok: false, error: resolved.error };
	}

	try {
		const locator = page.getByRole(
			resolved.role as Parameters<typeof page.getByRole>[0],
			{ name: resolved.name, exact: true },
		);

		await locator.dblclick({ timeout: 10_000 });

		return {
			ok: true,
			data: `Double tapped ${ref} [${resolved.role}] "${resolved.name}"`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `Double tap failed: ${message}` };
	}
}

async function handleDrag(page: Page, args: string[]): Promise<Response> {
	const sourceRef = args[0];
	if (!sourceRef || !sourceRef.startsWith("@")) {
		return {
			ok: false,
			error: "Usage: browse gesture drag <@ref> --to <@ref>",
		};
	}

	const toIdx = args.indexOf("--to");
	const targetRef =
		toIdx !== -1 && toIdx + 1 < args.length ? args[toIdx + 1] : undefined;

	if (!targetRef || !targetRef.startsWith("@")) {
		return {
			ok: false,
			error: "Usage: browse gesture drag <@ref> --to <@ref>",
		};
	}

	const source = resolveRef(sourceRef);
	if ("error" in source) {
		return { ok: false, error: source.error };
	}

	const target = resolveRef(targetRef);
	if ("error" in target) {
		return { ok: false, error: target.error };
	}

	try {
		const srcLocator = page.getByRole(
			source.role as Parameters<typeof page.getByRole>[0],
			{ name: source.name, exact: true },
		);
		const tgtLocator = page.getByRole(
			target.role as Parameters<typeof page.getByRole>[0],
			{ name: target.name, exact: true },
		);

		await srcLocator.dragTo(tgtLocator, { timeout: 10_000 });

		return {
			ok: true,
			data: `Dragged ${sourceRef} "${source.name}" to ${targetRef} "${target.name}"`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `Drag failed: ${message}` };
	}
}
