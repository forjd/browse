const SCENARIO_RE = /^\s*Scenario(?: Outline)?:\s*(.+)$/gm;

export function buildCucumberCommand(featurePath?: string): string[] {
	return ["cucumber-js", ...(featurePath ? [featurePath] : [])];
}

export function extractScenarioNames(featureText: string): string[] {
	const matches = featureText.matchAll(SCENARIO_RE);
	return [...matches].map((m) => m[1].trim());
}
