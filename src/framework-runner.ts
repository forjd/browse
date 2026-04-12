export type FrameworkRunner = "jest" | "vitest";

export function buildFrameworkCommand(
	runner: FrameworkRunner,
	target?: string,
): string[] {
	if (runner === "vitest") {
		return ["vitest", "run", ...(target ? [target] : [])];
	}
	if (runner === "jest") {
		return ["jest", "--runInBand", ...(target ? [target] : [])];
	}
	throw new Error(`Unsupported framework: ${runner}`);
}
