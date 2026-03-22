import { beforeEach, describe, expect, mock, test } from "bun:test";
import { handleRecord } from "../src/commands/record.ts";
import {
	buildTarget,
	convertToFlowSteps,
	deduplicateSteps,
	getInjectedScript,
	getStepCount,
	isPaused,
	isRecording,
	pauseSession,
	pushEvent,
	type RecordedEvent,
	replaceBaseUrl,
	resumeSession,
	startSession,
	stopSession,
} from "../src/recorder.ts";

// --- recorder.ts unit tests ---

describe("buildTarget", () => {
	test("prefers accessible name", () => {
		expect(
			buildTarget({
				accessibleName: "Submit",
				ariaLabel: "submit-btn",
				selector: "button.submit",
			}),
		).toBe("Submit");
	});

	test("falls back to aria-label", () => {
		expect(
			buildTarget({ ariaLabel: "close-dialog", selector: "button.close" }),
		).toBe("close-dialog");
	});

	test("falls back to placeholder", () => {
		expect(
			buildTarget({ placeholder: "Enter email", selector: "input.email" }),
		).toBe("Enter email");
	});

	test("falls back to data-testid", () => {
		expect(buildTarget({ testId: "login-btn", selector: "button" })).toBe(
			'[data-testid="login-btn"]',
		);
	});

	test("falls back to CSS selector", () => {
		expect(buildTarget({ selector: "button.primary" })).toBe("button.primary");
	});

	test("returns unknown for empty target", () => {
		expect(buildTarget(undefined)).toBe("unknown");
		expect(buildTarget({})).toBe("unknown");
	});
});

describe("deduplicateSteps", () => {
	test("collapses rapid fill events on same target", () => {
		const steps = [
			{
				event: {
					type: "fill" as const,
					target: { accessibleName: "Email" },
					value: "t",
					timestamp: 1000,
				},
			},
			{
				event: {
					type: "fill" as const,
					target: { accessibleName: "Email" },
					value: "te",
					timestamp: 1100,
				},
			},
			{
				event: {
					type: "fill" as const,
					target: { accessibleName: "Email" },
					value: "test",
					timestamp: 1200,
				},
			},
		];
		const result = deduplicateSteps(steps);
		expect(result).toHaveLength(1);
		expect(result[0].event.value).toBe("test");
	});

	test("does not collapse fills on different targets", () => {
		const steps = [
			{
				event: {
					type: "fill" as const,
					target: { accessibleName: "Email" },
					value: "a@b.com",
					timestamp: 1000,
				},
			},
			{
				event: {
					type: "fill" as const,
					target: { accessibleName: "Password" },
					value: "secret",
					timestamp: 1100,
				},
			},
		];
		const result = deduplicateSteps(steps);
		expect(result).toHaveLength(2);
	});

	test("does not collapse fills with large time gap", () => {
		const steps = [
			{
				event: {
					type: "fill" as const,
					target: { accessibleName: "Email" },
					value: "a",
					timestamp: 1000,
				},
			},
			{
				event: {
					type: "fill" as const,
					target: { accessibleName: "Email" },
					value: "ab",
					timestamp: 5000,
				},
			},
		];
		const result = deduplicateSteps(steps);
		expect(result).toHaveLength(2);
	});

	test("returns empty array for empty input", () => {
		expect(deduplicateSteps([])).toEqual([]);
	});
});

describe("convertToFlowSteps", () => {
	test("converts click events", () => {
		const steps = convertToFlowSteps([
			{
				event: {
					type: "click",
					target: { accessibleName: "Login" },
					timestamp: 1000,
				},
			},
		]);
		expect(steps).toEqual([{ click: "Login" }]);
	});

	test("converts fill events", () => {
		const steps = convertToFlowSteps([
			{
				event: {
					type: "fill",
					target: { accessibleName: "Email" },
					value: "test@example.com",
					timestamp: 1000,
				},
			},
		]);
		expect(steps).toEqual([{ fill: { Email: "test@example.com" } }]);
	});

	test("converts select events", () => {
		const steps = convertToFlowSteps([
			{
				event: {
					type: "select",
					target: { accessibleName: "Country" },
					value: "US",
					timestamp: 1000,
				},
			},
		]);
		expect(steps).toEqual([{ select: { Country: "US" } }]);
	});

	test("converts navigation events", () => {
		const steps = convertToFlowSteps([
			{
				event: {
					type: "navigation",
					url: "https://example.com/login",
					timestamp: 1000,
				},
			},
		]);
		expect(steps).toEqual([{ goto: "https://example.com/login" }]);
	});
});

describe("replaceBaseUrl", () => {
	test("replaces base URL with variable", () => {
		const steps = [
			{ goto: "https://example.com/login" },
			{ goto: "https://example.com/dashboard" },
		];
		const result = replaceBaseUrl(steps, "https://example.com");
		expect(result).toEqual([
			{ goto: "{{base_url}}/login" },
			{ goto: "{{base_url}}/dashboard" },
		]);
	});

	test("does not replace unrelated URLs", () => {
		const steps = [{ goto: "https://other.com/page" }];
		const result = replaceBaseUrl(steps, "https://example.com");
		expect(result).toEqual([{ goto: "https://other.com/page" }]);
	});

	test("strips trailing slash from base", () => {
		const steps = [{ goto: "https://example.com/page" }];
		const result = replaceBaseUrl(steps, "https://example.com/");
		expect(result).toEqual([{ goto: "{{base_url}}/page" }]);
	});

	test("does not modify non-goto steps", () => {
		const steps = [{ click: "Submit" }];
		const result = replaceBaseUrl(steps, "https://example.com");
		expect(result).toEqual([{ click: "Submit" }]);
	});
});

describe("getInjectedScript", () => {
	test("returns a non-empty script string", () => {
		const script = getInjectedScript();
		expect(typeof script).toBe("string");
		expect(script.length).toBeGreaterThan(0);
	});

	test("references __browseRecordEvent", () => {
		const script = getInjectedScript();
		expect(script).toContain("__browseRecordEvent");
	});

	test("includes click, input, and change listeners", () => {
		const script = getInjectedScript();
		expect(script).toContain("'click'");
		expect(script).toContain("'input'");
		expect(script).toContain("'change'");
	});
});

// --- Session state tests ---

describe("recording session state", () => {
	beforeEach(() => {
		// Ensure clean state — stop any active session
		if (isRecording()) {
			stopSession();
		}
	});

	test("starts and stops a session", () => {
		expect(isRecording()).toBe(false);
		startSession("test-flow", "out.json");
		expect(isRecording()).toBe(true);

		const result = stopSession();
		expect(isRecording()).toBe(false);
		expect(result.config.description).toBe("test-flow");
		expect(result.outputPath).toBe("out.json");
	});

	test("pauses and resumes", () => {
		startSession("test", "out.json");

		expect(isPaused()).toBe(false);
		pauseSession();
		expect(isPaused()).toBe(true);
		resumeSession();
		expect(isPaused()).toBe(false);

		stopSession();
	});

	test("does not capture events when paused", () => {
		startSession("test", "out.json");

		pushEvent({
			type: "click",
			target: { accessibleName: "A" },
			timestamp: 1000,
		});
		expect(getStepCount()).toBe(1);

		pauseSession();
		pushEvent({
			type: "click",
			target: { accessibleName: "B" },
			timestamp: 2000,
		});
		expect(getStepCount()).toBe(1);

		resumeSession();
		pushEvent({
			type: "click",
			target: { accessibleName: "C" },
			timestamp: 3000,
		});
		expect(getStepCount()).toBe(2);

		stopSession();
	});

	test("detects base URL from first navigation", () => {
		startSession("test", "out.json");

		pushEvent({
			type: "navigation",
			url: "https://myapp.com/login",
			timestamp: 1000,
		});
		pushEvent({
			type: "navigation",
			url: "https://myapp.com/dashboard",
			timestamp: 2000,
		});

		const result = stopSession();
		// Both should have {{base_url}} replacements
		expect(result.config.steps).toEqual([
			{ goto: "{{base_url}}/login" },
			{ goto: "{{base_url}}/dashboard" },
		]);
	});
});

// --- handleRecord command tests ---

describe("handleRecord", () => {
	function createMockPage() {
		const exposedFunctions: Record<string, Function> = {};
		const initScripts: string[] = [];
		const evaluatedScripts: string[] = [];
		const listeners: Record<string, Function[]> = {};

		return {
			exposeFunction: mock(async (name: string, fn: Function) => {
				exposedFunctions[name] = fn;
			}),
			addInitScript: mock(async (script: string) => {
				initScripts.push(script);
			}),
			evaluate: mock(async (script: string) => {
				evaluatedScripts.push(script as string);
			}),
			mainFrame: mock(() => ({
				url: () => "https://example.com",
			})),
			on: mock((event: string, fn: Function) => {
				if (!listeners[event]) listeners[event] = [];
				listeners[event].push(fn);
			}),
			_exposed: exposedFunctions,
			_initScripts: initScripts,
			_evaluated: evaluatedScripts,
			_listeners: listeners,
		};
	}

	test("returns usage when no subcommand", async () => {
		const page = createMockPage();
		const result = await handleRecord(page as any, []);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage:");
		}
	});

	test("returns error for unknown subcommand", async () => {
		const page = createMockPage();
		const result = await handleRecord(page as any, ["unknown"]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown record subcommand");
		}
	});

	test("start exposes function and injects script", async () => {
		const page = createMockPage();

		// Ensure clean state
		if (isRecording()) stopSession();

		const result = await handleRecord(page as any, ["start"]);
		expect(result.ok).toBe(true);
		expect(page.exposeFunction).toHaveBeenCalled();
		expect(page.addInitScript).toHaveBeenCalled();
		expect(page.evaluate).toHaveBeenCalled();

		// Clean up
		await handleRecord(page as any, ["stop"]);
	});

	test("start with custom output and name", async () => {
		const page = createMockPage();

		if (isRecording()) stopSession();

		const result = await handleRecord(page as any, [
			"start",
			"--output",
			"test.flow.json",
			"--name",
			"my flow",
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("test.flow.json");
			expect(result.data).toContain("my flow");
		}

		// Clean up
		await handleRecord(page as any, ["stop"]);
	});

	test("start fails if already recording", async () => {
		const page = createMockPage();

		if (isRecording()) stopSession();

		await handleRecord(page as any, ["start"]);
		const result = await handleRecord(page as any, ["start"]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("already in progress");
		}

		// Clean up
		await handleRecord(page as any, ["stop"]);
	});

	test("stop fails if not recording", async () => {
		const page = createMockPage();
		if (isRecording()) stopSession();

		const result = await handleRecord(page as any, ["stop"]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("No recording in progress");
		}
	});

	test("pause fails if not recording", async () => {
		const page = createMockPage();
		if (isRecording()) stopSession();

		const result = await handleRecord(page as any, ["pause"]);
		expect(result.ok).toBe(false);
	});

	test("resume fails if not recording", async () => {
		const page = createMockPage();
		if (isRecording()) stopSession();

		const result = await handleRecord(page as any, ["resume"]);
		expect(result.ok).toBe(false);
	});

	test("pause and resume during recording", async () => {
		const page = createMockPage();
		if (isRecording()) stopSession();

		await handleRecord(page as any, ["start"]);

		const pauseResult = await handleRecord(page as any, ["pause"]);
		expect(pauseResult.ok).toBe(true);

		const resumeResult = await handleRecord(page as any, ["resume"]);
		expect(resumeResult.ok).toBe(true);

		// Clean up
		await handleRecord(page as any, ["stop"]);
	});

	test("double pause fails", async () => {
		const page = createMockPage();
		if (isRecording()) stopSession();

		await handleRecord(page as any, ["start"]);
		await handleRecord(page as any, ["pause"]);

		const result = await handleRecord(page as any, ["pause"]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("already paused");
		}

		// Clean up
		stopSession();
	});

	test("resume when not paused fails", async () => {
		const page = createMockPage();
		if (isRecording()) stopSession();

		await handleRecord(page as any, ["start"]);

		const result = await handleRecord(page as any, ["resume"]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("not paused");
		}

		// Clean up
		await handleRecord(page as any, ["stop"]);
	});
});
