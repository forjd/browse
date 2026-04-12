import type { StepResult } from "./flow-runner.ts";

export type ReporterFormat =
	| "junit"
	| "json"
	| "markdown"
	| "tap"
	| "allure"
	| "html";

export type ReporterRenderContext = {
	flowName: string;
	results: StepResult[];
	durationMs: number;
};

export type CustomReporter = {
	name: string;
	render: (ctx: ReporterRenderContext) => string;
};

export class CustomReporterRegistry {
	#reporters = new Map<string, CustomReporter>();

	register(reporter: CustomReporter): void {
		if (!reporter.name.trim()) {
			throw new Error("Reporter name is required");
		}
		this.#reporters.set(reporter.name, reporter);
	}

	get(name: string): CustomReporter | undefined {
		return this.#reporters.get(name);
	}

	list(): string[] {
		return [...this.#reporters.keys()].sort();
	}
}
