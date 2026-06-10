/**
 * Maximum allowed length for user-supplied regex patterns to limit ReDoS risk.
 */
const MAX_PATTERN_LENGTH = 1024;

/**
 * Largest bounded repetition count still considered "bounded" by the
 * nested-quantifier check below.
 */
const MAX_BOUNDED_REPEAT = 100;

/** Is there an unbounded (or very large bounded) quantifier at `index`? */
function unboundedQuantifierAt(pattern: string, index: number): boolean {
	const ch = pattern[index];
	if (ch === "*" || ch === "+") return true;
	if (ch === "{") {
		const match = pattern.slice(index).match(/^\{(\d+),(\d*)\}/);
		if (match) {
			return match[2] === "" || Number(match[2]) > MAX_BOUNDED_REPEAT;
		}
	}
	return false;
}

/**
 * Detect nested unbounded quantifiers (e.g. `(a+)*`, `(\d*)+`), the primary
 * source of catastrophic backtracking. This is a heuristic: it does not catch
 * every ReDoS pattern (e.g. ambiguous alternation like `(a|a)+`), but it
 * blocks the common exponential cases.
 */
function hasNestedUnboundedQuantifier(pattern: string): boolean {
	// One entry per open group: did we see an unbounded quantifier inside?
	const groupStack: { sawUnbounded: boolean }[] = [];
	let inCharClass = false;

	for (let i = 0; i < pattern.length; i++) {
		const ch = pattern[i];
		if (ch === "\\") {
			i++;
			continue;
		}
		if (inCharClass) {
			if (ch === "]") inCharClass = false;
			continue;
		}
		switch (ch) {
			case "[":
				inCharClass = true;
				break;
			case "(":
				groupStack.push({ sawUnbounded: false });
				break;
			case ")": {
				const group = groupStack.pop();
				// Unbalanced parens are rejected by the RegExp constructor
				if (!group) break;
				const quantified = unboundedQuantifierAt(pattern, i + 1);
				if (group.sawUnbounded && quantified) return true;
				if (groupStack.length > 0 && (group.sawUnbounded || quantified)) {
					groupStack[groupStack.length - 1].sawUnbounded = true;
				}
				break;
			}
			default:
				if (
					groupStack.length > 0 &&
					unboundedQuantifierAt(pattern, i) &&
					// `{` only acts as a quantifier when it parses as one;
					// skip past it either way so its digits aren't re-scanned
					true
				) {
					groupStack[groupStack.length - 1].sawUnbounded = true;
				}
				break;
		}
	}

	return false;
}

/**
 * Compile a user-supplied regex string safely.
 *
 * Validates the pattern is well-formed, within length limits, and free of
 * nested unbounded quantifiers to mitigate ReDoS from untrusted flow/config
 * input. The nested-quantifier check is a heuristic and does not block every
 * pathological pattern.
 *
 * @throws {Error} If the pattern is too long, syntactically invalid, or
 * contains nested unbounded quantifiers.
 */
export function compileSafePattern(pattern: string): RegExp {
	if (pattern.length > MAX_PATTERN_LENGTH) {
		throw new Error(
			`Regex pattern exceeds maximum length of ${MAX_PATTERN_LENGTH} characters.`,
		);
	}

	if (hasNestedUnboundedQuantifier(pattern)) {
		throw new Error(
			`Regex pattern "${pattern}" contains nested unbounded quantifiers, which can cause catastrophic backtracking.`,
		);
	}

	try {
		return new RegExp(pattern);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid regex pattern "${pattern}": ${detail}`);
	}
}
