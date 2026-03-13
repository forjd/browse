import { arch, platform } from "node:os";
import pkg from "../package.json";

const VERSION = pkg.version;

export function formatVersion(): string {
	return `browse ${VERSION} (${platform()}-${arch()})`;
}
