/**
 * Recording session manager — captures browser interactions as flow JSON.
 *
 * Maintains module-level state for the active recording session,
 * accumulates steps, deduplicates rapid keystrokes, and exports
 * valid FlowConfig JSON.
 */

import { randomUUID } from "node:crypto";
import type { FlowConfig, FlowStep } from "./config.ts";

/** Raw event from the injected browser script. */
export type RecordedEvent = {
	type: "click" | "fill" | "select" | "navigation";
	/** Target descriptor with targeting info. */
	target?: {
		accessibleName?: string;
		ariaLabel?: string;
		placeholder?: string;
		testId?: string;
		selector?: string;
	};
	/** Value for fill / select events. */
	value?: string;
	/** URL for navigation events. */
	url?: string;
	/** Timestamp in ms since epoch. */
	timestamp: number;
};

/** Internal recorded step before post-processing. */
type RawStep = {
	event: RecordedEvent;
};

/**
 * Build the best available target string for an element.
 * Priority: accessible name > aria-label > placeholder > data-testid > CSS selector.
 */
export function buildTarget(target?: RecordedEvent["target"]): string {
	if (!target) return "unknown";
	if (target.accessibleName) return target.accessibleName;
	if (target.ariaLabel) return target.ariaLabel;
	if (target.placeholder) return target.placeholder;
	if (target.testId) return `[data-testid="${target.testId}"]`;
	if (target.selector) return target.selector;
	return "unknown";
}

/**
 * Did buildTarget fall back to a CSS selector (rather than an accessible
 * name)? Selector targets must be emitted as `{ selector }` flow steps —
 * the replay side treats plain strings as accessible names.
 */
function isSelectorTarget(target?: RecordedEvent["target"]): boolean {
	if (!target) return false;
	return (
		!target.accessibleName &&
		!target.ariaLabel &&
		!target.placeholder &&
		Boolean(target.testId || target.selector)
	);
}

/**
 * Convert absolute URLs to {{base_url}} variables.
 * Detects the common base from the first navigation URL.
 */
export function replaceBaseUrl(steps: FlowStep[], baseUrl: string): FlowStep[] {
	if (!baseUrl) return steps;

	// Normalize: strip trailing slash
	const base = baseUrl.replace(/\/+$/, "");

	return steps.map((step) => {
		if ("goto" in step) {
			const url = (step as { goto: string }).goto;
			// Require a path boundary so e.g. https://example.com doesn't
			// rewrite https://example.communityfoo
			if (
				url === base ||
				url.startsWith(`${base}/`) ||
				url.startsWith(`${base}?`) ||
				url.startsWith(`${base}#`)
			) {
				return { goto: url.replace(base, "{{base_url}}") };
			}
		}
		return step;
	});
}

/**
 * Collapse rapid sequential fill events on the same target into a single fill step.
 * Two fill events are "rapid" if they share the same target and occur within 2 seconds.
 */
export function deduplicateSteps(rawSteps: RawStep[]): RawStep[] {
	if (rawSteps.length === 0) return [];

	const result: RawStep[] = [rawSteps[0]];

	for (let i = 1; i < rawSteps.length; i++) {
		const prev = result[result.length - 1];
		const curr = rawSteps[i];

		// Collapse rapid fill events on the same target
		if (
			prev.event.type === "fill" &&
			curr.event.type === "fill" &&
			buildTarget(prev.event.target) === buildTarget(curr.event.target) &&
			curr.event.timestamp - prev.event.timestamp < 2000
		) {
			// Replace previous with current (keeps latest value)
			result[result.length - 1] = curr;
			continue;
		}

		result.push(curr);
	}

	return result;
}

/**
 * Convert raw steps into FlowStep array.
 */
export function convertToFlowSteps(rawSteps: RawStep[]): FlowStep[] {
	const steps: FlowStep[] = [];

	for (const raw of rawSteps) {
		const { event } = raw;

		switch (event.type) {
			case "click": {
				const target = buildTarget(event.target);
				steps.push(
					isSelectorTarget(event.target)
						? { click: { selector: target } }
						: { click: target },
				);
				break;
			}
			case "fill": {
				const target = buildTarget(event.target);
				const value = event.value ?? "";
				steps.push(
					isSelectorTarget(event.target)
						? { fill: { selector: target, value } }
						: { fill: { [target]: value } },
				);
				break;
			}
			case "select": {
				const target = buildTarget(event.target);
				const value = event.value ?? "";
				steps.push(
					isSelectorTarget(event.target)
						? { select: { selector: target, value } }
						: { select: { [target]: value } },
				);
				break;
			}
			case "navigation": {
				const url = event.url ?? "";
				steps.push({ goto: url });
				break;
			}
		}
	}

	return steps;
}

// ---- Module-level recording state ----

let recording = false;
let paused = false;
let rawSteps: RawStep[] = [];
let flowName = "recorded-flow";
let outputPath = "";
let detectedBaseUrl = "";
let recordNonce = "";

const MAX_RECORDED_EVENT_BYTES = 16 * 1024;
const MAX_RECORDED_STRING_LENGTH = 4096;
const RECORDED_EVENT_TYPES = new Set(["click", "fill", "select", "navigation"]);

export function isRecording(): boolean {
	return recording;
}

export function isPaused(): boolean {
	return paused;
}

export function startSession(name: string, output: string): void {
	recording = true;
	paused = false;
	rawSteps = [];
	flowName = name || "recorded-flow";
	outputPath = output;
	detectedBaseUrl = "";
	recordNonce = randomUUID();
}

export function stopSession(): {
	config: FlowConfig;
	outputPath: string;
} {
	const deduplicated = deduplicateSteps(rawSteps);
	let steps = convertToFlowSteps(deduplicated);

	if (detectedBaseUrl) {
		steps = replaceBaseUrl(steps, detectedBaseUrl);
	}

	const config: FlowConfig = {
		description: flowName,
		steps,
	};

	const result = { config, outputPath };

	// Reset state
	recording = false;
	paused = false;
	rawSteps = [];
	recordNonce = "";

	return result;
}

export function pauseSession(): void {
	paused = true;
}

export function resumeSession(): void {
	paused = false;
}

export function pushEvent(event: RecordedEvent): void {
	if (!recording || paused) return;

	// Detect base URL from first navigation
	if (event.type === "navigation" && event.url && !detectedBaseUrl) {
		try {
			const parsed = new URL(event.url);
			detectedBaseUrl = `${parsed.protocol}//${parsed.host}`;
		} catch {
			// ignore invalid URLs
		}
	}

	rawSteps.push({ event });
}

export function getStepCount(): number {
	return rawSteps.length;
}

export function getRecorderNonce(): string {
	return recordNonce;
}

function safeString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	return value.length <= MAX_RECORDED_STRING_LENGTH ? value : undefined;
}

function validateRecordedEvent(value: unknown): RecordedEvent | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const raw = value as Record<string, unknown>;
	if (
		typeof raw.type !== "string" ||
		!RECORDED_EVENT_TYPES.has(raw.type) ||
		typeof raw.timestamp !== "number" ||
		!Number.isFinite(raw.timestamp)
	) {
		return null;
	}

	const event: RecordedEvent = {
		type: raw.type as RecordedEvent["type"],
		timestamp: raw.timestamp,
	};

	if (raw.target !== undefined) {
		if (
			typeof raw.target !== "object" ||
			raw.target === null ||
			Array.isArray(raw.target)
		) {
			return null;
		}
		const target = raw.target as Record<string, unknown>;
		const sanitizedTarget: NonNullable<RecordedEvent["target"]> = {};
		for (const key of [
			"accessibleName",
			"ariaLabel",
			"placeholder",
			"testId",
			"selector",
		] as const) {
			const str = safeString(target[key]);
			if (str !== undefined) sanitizedTarget[key] = str;
		}
		event.target = sanitizedTarget;
	}

	if (raw.value !== undefined) {
		const value = safeString(raw.value);
		if (value === undefined) return null;
		event.value = value;
	}

	if (raw.url !== undefined) {
		const url = safeString(raw.url);
		if (url === undefined) return null;
		event.url = url;
	}

	return event;
}

export function parseRecordedEventPayload(raw: string): RecordedEvent | null {
	if (
		!recordNonce ||
		typeof raw !== "string" ||
		raw.length > MAX_RECORDED_EVENT_BYTES
	) {
		return null;
	}

	let payload: unknown;
	try {
		payload = JSON.parse(raw);
	} catch {
		return null;
	}
	if (
		typeof payload !== "object" ||
		payload === null ||
		Array.isArray(payload)
	) {
		return null;
	}

	const envelope = payload as Record<string, unknown>;
	if (envelope.nonce !== recordNonce) return null;
	return validateRecordedEvent(envelope.event);
}

/**
 * Returns the JavaScript to inject into the page that captures user interactions
 * and forwards them via the exposed __browseRecordEvent function.
 */
export function getInjectedScript(nonce = recordNonce): string {
	const encodedNonce = JSON.stringify(nonce);
	return `
(function() {
	if (window.__browseRecorderAttached) return;
	window.__browseRecorderAttached = true;
	const nonce = ${encodedNonce};

	function getTargetInfo(el) {
		if (!el || !el.tagName) return {};
		const info = {};

		// Accessible name: aria-label, then label association, then text content for buttons
		const ariaLabel = el.getAttribute('aria-label');
		if (ariaLabel) {
			info.ariaLabel = ariaLabel;
		}

		// Check for associated label
		const id = el.getAttribute('id');
		if (id) {
			const label = document.querySelector('label[for="' + id + '"]');
			if (label) {
				info.accessibleName = label.textContent.trim();
			}
		}

		// For buttons, use text content as accessible name
		if ((el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') && !info.accessibleName) {
			const text = el.textContent.trim();
			if (text && text.length < 100) {
				info.accessibleName = text;
			}
		}

		// For links, use text content
		if (el.tagName === 'A' && !info.accessibleName) {
			const text = el.textContent.trim();
			if (text && text.length < 100) {
				info.accessibleName = text;
			}
		}

		const placeholder = el.getAttribute('placeholder');
		if (placeholder) info.placeholder = placeholder;

		const testId = el.getAttribute('data-testid');
		if (testId) info.testId = testId;

		// CSS selector as fallback
		let selector = el.tagName.toLowerCase();
		if (el.id) {
			selector = '#' + el.id;
		} else if (el.className && typeof el.className === 'string') {
			const classes = el.className.trim().split(/\\s+/).slice(0, 2).join('.');
			if (classes) selector += '.' + classes;
		}
		info.selector = selector;

		return info;
	}

	function send(event) {
		window.__browseRecordEvent(JSON.stringify({ nonce, event }));
	}

	// Click handler
	document.addEventListener('click', function(e) {
		const target = e.target;
		if (!target || !target.tagName) return;
		try {
			send({
				type: 'click',
				target: getTargetInfo(target),
				timestamp: Date.now()
			});
		} catch(err) {}
	}, true);

	// Input/change handler for fills
	document.addEventListener('input', function(e) {
		const target = e.target;
		if (!target) return;
		const tag = target.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') {
			try {
				send({
					type: 'fill',
					target: getTargetInfo(target),
					value: target.value,
					timestamp: Date.now()
				});
			} catch(err) {}
		}
	}, true);

	// Select change handler
	document.addEventListener('change', function(e) {
		const target = e.target;
		if (!target || target.tagName !== 'SELECT') return;
		try {
			send({
				type: 'select',
				target: getTargetInfo(target),
				value: target.value,
				timestamp: Date.now()
			});
		} catch(err) {}
	}, true);
})();
`;
}
