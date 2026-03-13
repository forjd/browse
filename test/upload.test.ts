import { describe, expect, mock, test } from "bun:test";
import { handleUpload } from "../src/commands/upload.ts";
import {
	type AccessibilityNode,
	assignRefs,
	clearRefs,
	markStale,
} from "../src/refs.ts";

function makeTree(...children: AccessibilityNode[]): AccessibilityNode {
	return { role: "WebArea", name: "Page", children };
}

function mockPage() {
	return {
		getByRole: mock((_role: string, _opts?: Record<string, unknown>) => ({
			nth: mock((_n: number) => ({
				setInputFiles: mock(() => Promise.resolve()),
			})),
			setInputFiles: mock(() => Promise.resolve()),
		})),
	} as never;
}

describe("handleUpload", () => {
	test("returns error when ref arg is missing", async () => {
		clearRefs();
		const page = mockPage();

		const result = await handleUpload(page, []);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("returns error when ref does not start with @", async () => {
		clearRefs();
		const page = mockPage();

		const result = await handleUpload(page, ["e1", "/tmp/file.pdf"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("@");
		}
	});

	test("returns error when no file paths provided", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Upload", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleUpload(page, ["@e1"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Usage");
		}
	});

	test("returns error for unknown ref", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Upload", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleUpload(page, ["@e99", "/tmp/file.pdf"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Unknown ref");
		}
	});

	test("returns stale error after navigation", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Upload", children: [] }),
			"default",
		);
		markStale();
		const page = mockPage();

		const result = await handleUpload(page, ["@e1", "/tmp/file.pdf"]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("stale");
		}
	});

	test("returns error when file does not exist", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Upload", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleUpload(page, [
			"@e1",
			"/tmp/nonexistent-file-abc123.pdf",
		]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("does not exist");
		}
	});

	test("uploads a single file and returns confirmation", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Choose File", children: [] }),
			"default",
		);
		const page = mockPage();

		// Use a file that definitely exists
		const result = await handleUpload(page, ["@e1", "package.json"]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Uploaded");
			expect(result.data).toContain("1 file");
			expect(result.data).toContain("@e1");
		}
	});

	test("uploads multiple files and returns confirmation", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Choose Files", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleUpload(page, [
			"@e1",
			"package.json",
			"tsconfig.json",
		]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Uploaded");
			expect(result.data).toContain("2 files");
			expect(result.data).toContain("@e1");
		}
	});

	test("returns error when any file in a multi-file upload does not exist", async () => {
		clearRefs();
		assignRefs(
			makeTree({ role: "button", name: "Upload", children: [] }),
			"default",
		);
		const page = mockPage();

		const result = await handleUpload(page, [
			"@e1",
			"package.json",
			"/tmp/nonexistent-abc123.pdf",
		]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("does not exist");
		}
	});
});
