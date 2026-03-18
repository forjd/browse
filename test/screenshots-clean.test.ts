import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { handleScreenshots } from "../src/commands/screenshots.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-screenshots-clean");

function createScreenshot(name: string, ageMs = 0): string {
	const filepath = join(TEST_DIR, name);
	writeFileSync(filepath, "fake-png-data");
	if (ageMs > 0) {
		const past = new Date(Date.now() - ageMs);
		utimesSync(filepath, past, past);
	}
	return filepath;
}

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("screenshots clean --dry-run", () => {
	test("lists files that would be deleted without removing them", async () => {
		createScreenshot("a.png");
		createScreenshot("b.png");

		const res = await handleScreenshots(["clean", "--dry-run"], TEST_DIR);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("Would delete 2 screenshot");
		}
		// Files must still exist
		expect(existsSync(join(TEST_DIR, "a.png"))).toBe(true);
		expect(existsSync(join(TEST_DIR, "b.png"))).toBe(true);
	});

	test("respects --older-than filter in dry-run mode", async () => {
		createScreenshot("old.png", 2 * 60 * 60 * 1000); // 2 hours old
		createScreenshot("new.png"); // just created

		const res = await handleScreenshots(
			["clean", "--older-than", "1h", "--dry-run"],
			TEST_DIR,
		);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("Would delete 1 screenshot");
		}
		// Both files must still exist
		expect(existsSync(join(TEST_DIR, "old.png"))).toBe(true);
		expect(existsSync(join(TEST_DIR, "new.png"))).toBe(true);
	});

	test("reports zero when no files match in dry-run mode", async () => {
		createScreenshot("new.png"); // just created

		const res = await handleScreenshots(
			["clean", "--older-than", "1h", "--dry-run"],
			TEST_DIR,
		);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("Would delete 0 screenshot");
		}
	});

	test("shows file names in dry-run output", async () => {
		createScreenshot("shot1.png");

		const res = await handleScreenshots(["clean", "--dry-run"], TEST_DIR);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("shot1.png");
		}
	});
});

describe("screenshots clean (existing behaviour with dir override)", () => {
	test("deletes files without --dry-run", async () => {
		createScreenshot("a.png");
		createScreenshot("b.png");

		const res = await handleScreenshots(["clean"], TEST_DIR);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("Deleted 2 screenshot");
		}
		expect(existsSync(join(TEST_DIR, "a.png"))).toBe(false);
		expect(existsSync(join(TEST_DIR, "b.png"))).toBe(false);
	});

	test("deletes only old files with --older-than", async () => {
		createScreenshot("old.png", 2 * 60 * 60 * 1000);
		createScreenshot("new.png");

		const res = await handleScreenshots(
			["clean", "--older-than", "1h"],
			TEST_DIR,
		);

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data).toContain("Deleted 1 screenshot");
		}
		expect(existsSync(join(TEST_DIR, "old.png"))).toBe(false);
		expect(existsSync(join(TEST_DIR, "new.png"))).toBe(true);
	});
});
