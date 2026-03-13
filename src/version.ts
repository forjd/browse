import { arch, platform } from "node:os";

const VERSION = "0.3.0";

export function formatVersion(): string {
	return `browse ${VERSION} (${platform()}-${arch()})`;
}
