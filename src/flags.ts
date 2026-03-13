/**
 * Global flags handled at the CLI level (not forwarded to commands).
 */
const GLOBAL_FLAGS = new Set(["--help"]);

/**
 * Check for unknown `--` prefixed flags in args.
 * Returns an array of unrecognised flag names.
 *
 * Short flags (single dash, e.g. `-i`) are ignored — they use a different
 * convention and are validated per-command where needed.
 */
export function checkUnknownFlags(
	args: string[],
	knownFlags: string[],
): string[] {
	const known = new Set([...knownFlags, ...GLOBAL_FLAGS]);
	const unknown: string[] = [];

	for (const arg of args) {
		if (arg.startsWith("--") && !known.has(arg)) {
			unknown.push(arg);
		}
	}

	return unknown;
}

/**
 * Format an error message for unknown flags.
 */
export function unknownFlagsError(command: string, flags: string[]): string {
	const plural = flags.length > 1 ? "flags" : "flag";
	return `Unknown ${plural} for '${command}': ${flags.join(", ")}. Run 'browse help ${command}' for usage.`;
}
