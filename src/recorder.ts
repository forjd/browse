/**
 * Recording session manager — captures browser interactions as flow JSON.
 *
 * Maintains module-level state for the active recording session,
 * accumulates steps, deduplicates rapid keystrokes, and exports
 * valid FlowConfig JSON.
 */

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
			if (url.startsWith(base)) {
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
				steps.push({ click: target });
				break;
			}
			case "fill": {
				const target = buildTarget(event.target);
				const value = event.value ?? "";
				steps.push({ fill: { [target]: value } });
				break;
			}
			case "select": {
				const target = buildTarget(event.target);
				const value = event.value ?? "";
				steps.push({ select: { [target]: value } });
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

/**
 * Returns the JavaScript to inject into the page that captures user interactions
 * and forwards them via the exposed __browseRecordEvent function.
 */
export function getInjectedScript(): string {
	return `
(function() {
	if (window.__browseRecorderAttached) return;
	window.__browseRecorderAttached = true;

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

	// Click handler
	document.addEventListener('click', function(e) {
		const target = e.target;
		if (!target || !target.tagName) return;
		try {
			window.__browseRecordEvent(JSON.stringify({
				type: 'click',
				target: getTargetInfo(target),
				timestamp: Date.now()
			}));
		} catch(err) {}
	}, true);

	// Input/change handler for fills
	document.addEventListener('input', function(e) {
		const target = e.target;
		if (!target) return;
		const tag = target.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') {
			try {
				window.__browseRecordEvent(JSON.stringify({
					type: 'fill',
					target: getTargetInfo(target),
					value: target.value,
					timestamp: Date.now()
				}));
			} catch(err) {}
		}
	}, true);

	// Select change handler
	document.addEventListener('change', function(e) {
		const target = e.target;
		if (!target || target.tagName !== 'SELECT') return;
		try {
			window.__browseRecordEvent(JSON.stringify({
				type: 'select',
				target: getTargetInfo(target),
				value: target.value,
				timestamp: Date.now()
			}));
		} catch(err) {}
	}, true);
})();
`;
}
