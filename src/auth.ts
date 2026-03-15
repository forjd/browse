import { randomBytes } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

const TOKEN_PATH = "/tmp/browse-daemon.token";

/**
 * Generate a cryptographically secure token, write it to the token file,
 * and return it. The file is readable only by the current user (0o600).
 */
export function generateToken(): string {
	const token = randomBytes(32).toString("hex");
	mkdirSync(dirname(TOKEN_PATH), { recursive: true });
	writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
	return token;
}

/**
 * Read the token from the token file. Returns null if the file
 * does not exist or is unreadable.
 */
export function readToken(): string | null {
	try {
		if (!existsSync(TOKEN_PATH)) return null;
		return readFileSync(TOKEN_PATH, "utf-8").trim();
	} catch {
		return null;
	}
}

/**
 * Remove the token file (called during daemon shutdown).
 */
export function cleanupToken(): void {
	rmSync(TOKEN_PATH, { force: true });
}

export { TOKEN_PATH };
