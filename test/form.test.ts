import { describe, expect, mock, test } from "bun:test";
import { handleForm } from "../src/commands/form.ts";

/**
 * Creates a mock Page that simulates Playwright locator methods.
 *
 * `fields` maps accessible names → { role, tagName }.
 * `labels` maps label text → { tagName }.
 * `placeholders` maps placeholder text → { tagName }.
 *
 * getByRole matches when role AND name both match a field entry.
 * getByLabel matches when the label text matches a labels entry.
 * getByPlaceholder matches when the placeholder text matches a placeholders entry.
 */
function mockFormPage(
	fields: Record<string, { role: string; tagName?: string }> = {},
	labels: Record<string, { tagName?: string }> = {},
	placeholders: Record<string, { tagName?: string }> = {},
) {
	return {
		getByRole: mock((role: string, opts?: { name?: string }) => {
			const name = opts?.name;
			// Find a field whose accessible name matches AND whose role matches
			const match =
				name &&
				Object.entries(fields).find(
					([fieldName, f]) =>
						f.role === role && fieldName.toLowerCase() === name.toLowerCase(),
				);
			return {
				count: mock(() => Promise.resolve(match ? 1 : 0)),
				first: mock(() => ({
					fill: mock(() => Promise.resolve()),
					selectOption: mock(() => Promise.resolve()),
					check: mock(() => Promise.resolve()),
					uncheck: mock(() => Promise.resolve()),
					evaluate: mock(() =>
						Promise.resolve(match ? (match[1].tagName ?? "input") : "input"),
					),
				})),
			};
		}),
		getByLabel: mock((label: string) => {
			const match = Object.entries(labels).find(
				([l]) => l.toLowerCase() === label.toLowerCase(),
			);
			return {
				count: mock(() => Promise.resolve(match ? 1 : 0)),
				first: mock(() => ({
					fill: mock(() => Promise.resolve()),
					selectOption: mock(() => Promise.resolve()),
					evaluate: mock(() =>
						Promise.resolve(match ? (match[1].tagName ?? "input") : "input"),
					),
				})),
			};
		}),
		getByPlaceholder: mock((placeholder: string) => {
			const match = Object.entries(placeholders).find(
				([p]) => p.toLowerCase() === placeholder.toLowerCase(),
			);
			return {
				count: mock(() => Promise.resolve(match ? 1 : 0)),
				first: mock(() => ({
					fill: mock(() => Promise.resolve()),
					selectOption: mock(() => Promise.resolve()),
					evaluate: mock(() =>
						Promise.resolve(match ? (match[1].tagName ?? "input") : "input"),
					),
				})),
			};
		}),
	} as never;
}

describe("handleForm", () => {
	// ── Argument validation ──────────────────────────────────────────

	test("returns error when --data is missing", async () => {
		const page = mockFormPage();
		const result = await handleForm(page, []);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("Usage");
	});

	test("returns error for invalid JSON", async () => {
		const page = mockFormPage();
		const result = await handleForm(page, ["--data", "not-json"]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("Invalid JSON");
	});

	test("returns error for non-object JSON", async () => {
		const page = mockFormPage();
		const result = await handleForm(page, ["--data", "[1,2,3]"]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("must be a JSON object");
	});

	test("returns error for unknown flags", async () => {
		const page = mockFormPage();
		const result = await handleForm(page, ["--data", '{"x":"y"}', "--bogus"]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("Unknown flag");
	});

	// ── Role-based matching (existing behaviour) ─────────────────────

	test("fills a textbox matched by accessible name", async () => {
		const page = mockFormPage({ Username: { role: "textbox" } });
		const result = await handleForm(page, [
			"--data",
			'{"Username":"testuser"}',
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Username");
			expect(result.data).toContain("textbox");
		}
	});

	test("checks a checkbox matched by accessible name", async () => {
		const page = mockFormPage({ Subscribe: { role: "checkbox" } });
		const result = await handleForm(page, ["--data", '{"Subscribe":true}']);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Subscribe");
			expect(result.data).toContain("checkbox");
		}
	});

	// ── Label fallback (existing behaviour) ──────────────────────────

	test("fills via getByLabel when role matching misses", async () => {
		const page = mockFormPage({}, { Email: { tagName: "input" } });
		const result = await handleForm(page, ["--data", '{"Email":"a@b.com"}']);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toContain("by label");
	});

	// ── Key normalisation: trailing colon ────────────────────────────

	test("strips trailing colon from field key before matching", async () => {
		const page = mockFormPage({ Username: { role: "textbox" } });
		const result = await handleForm(page, [
			"--data",
			'{"Username:":"testuser"}',
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Username:");
			expect(result.data).toContain("textbox");
		}
	});

	test("strips trailing colon from boolean field key", async () => {
		const page = mockFormPage({ "Remember me": { role: "checkbox" } });
		const result = await handleForm(page, ["--data", '{"Remember me:":true}']);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toContain("Remember me:");
			expect(result.data).toContain("checkbox");
		}
	});

	// ── Key normalisation: whitespace ────────────────────────────────

	test("trims whitespace from field key before matching", async () => {
		const page = mockFormPage({ Email: { role: "textbox" } });
		const result = await handleForm(page, ["--data", '{" Email ":"a@b.com"}']);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toContain("textbox");
	});

	// ── Placeholder fallback ─────────────────────────────────────────

	test("fills via getByPlaceholder when role and label both miss", async () => {
		const page = mockFormPage(
			{},
			{},
			{ "Enter your email": { tagName: "input" } },
		);
		const result = await handleForm(page, [
			"--data",
			'{"Enter your email":"a@b.com"}',
		]);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toContain("by placeholder");
	});

	test("fills via getByPlaceholder for normalised key", async () => {
		const page = mockFormPage({}, {}, { "Search here": { tagName: "input" } });
		const result = await handleForm(page, [
			"--data",
			'{"Search here:":"query"}',
		]);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toContain("by placeholder");
	});

	// ── Error when nothing matches ───────────────────────────────────

	test("reports error with original key when no matching field found", async () => {
		const page = mockFormPage();
		const result = await handleForm(page, ["--data", '{"Nonexistent:":"val"}']);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Nonexistent:");
			expect(result.error).toContain("no matching form field found");
		}
	});

	// ── Mixed success / failure ──────────────────────────────────────

	test("reports partial failure when some fields match and others don't", async () => {
		const page = mockFormPage({ Username: { role: "textbox" } });
		const result = await handleForm(page, [
			"--data",
			'{"Username":"user","Missing":"val"}',
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("✓ Username");
			expect(result.error).toContain("✗ Missing");
		}
	});
});
