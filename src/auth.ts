import { randomBytes } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TOKEN_PATH = join(
	process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
	"browse",
	"daemon.token",
);

/**
 * Generate a cryptographically secure token, write it to the token file,
 * and return it. The file is readable only by the current user (0o600).
 */
export function generateToken(): string {
	const token = randomBytes(32).toString("hex");
	const dir = join(
		process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
		"browse",
	);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	chmodSync(dir, 0o700);
	writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
	chmodSync(TOKEN_PATH, 0o600);
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
