/**
 * Maximum allowed length for user-supplied regex patterns to limit ReDoS risk.
 */
const MAX_PATTERN_LENGTH = 1024;

/**
 * Compile a user-supplied regex string safely.
 *
 * Validates the pattern is well-formed and within length limits to
 * mitigate ReDoS from untrusted flow/config input.
 *
 * @throws {Error} If the pattern is too long or syntactically invalid.
 */
export function compileSafePattern(pattern: string): RegExp {
	if (pattern.length > MAX_PATTERN_LENGTH) {
		throw new Error(
			`Regex pattern exceeds maximum length of ${MAX_PATTERN_LENGTH} characters.`,
		);
	}

	try {
		return new RegExp(pattern);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid regex pattern "${pattern}": ${detail}`);
	}
}
