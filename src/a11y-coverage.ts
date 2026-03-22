import type { Page } from "playwright";

export type CoverageResult = {
	interactive: {
		total: number;
		withNames: number;
		missing: { role: string; selector: string }[];
	};
	images: { total: number; withAlt: number; missingAlt: string[] };
	formInputs: { total: number; withLabels: number };
	landmarks: { main: boolean; nav: boolean; header: boolean; footer: boolean };
	score: number;
};

export async function computeA11yCoverage(page: Page): Promise<CoverageResult> {
	return page.evaluate(() => {
		const result = {
			interactive: {
				total: 0,
				withNames: 0,
				missing: [] as { role: string; selector: string }[],
			},
			images: {
				total: 0,
				withAlt: 0,
				missingAlt: [] as string[],
			},
			formInputs: {
				total: 0,
				withLabels: 0,
			},
			landmarks: {
				main: !!document.querySelector("main, [role='main']"),
				nav: !!document.querySelector("nav, [role='navigation']"),
				header: !!document.querySelector("header, [role='banner']"),
				footer: !!document.querySelector("footer, [role='contentinfo']"),
			},
			score: 0,
		};

		// Interactive elements
		const interactiveSelectors =
			'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"]';
		const interactives = document.querySelectorAll(interactiveSelectors);
		result.interactive.total = interactives.length;

		for (const el of interactives) {
			const htmlEl = el as HTMLElement;
			const hasName =
				!!htmlEl.getAttribute("aria-label") ||
				!!htmlEl.getAttribute("aria-labelledby") ||
				!!htmlEl.getAttribute("title") ||
				!!htmlEl.innerText?.trim() ||
				!!(el as HTMLInputElement).placeholder;

			if (hasName) {
				result.interactive.withNames++;
			} else {
				const tag = el.tagName.toLowerCase();
				const role = el.getAttribute("role") ?? tag;
				const id = el.id ? `#${el.id}` : "";
				const cls = el.className
					? `.${(el.className as string).toString().split(" ")[0]}`
					: "";
				result.interactive.missing.push({
					role,
					selector: `${tag}${id}${cls}`,
				});
			}
		}

		// Images
		const images = document.querySelectorAll("img");
		result.images.total = images.length;
		for (const img of images) {
			if (img.hasAttribute("alt")) {
				result.images.withAlt++;
			} else {
				result.images.missingAlt.push(
					(img.src || img.getAttribute("data-src") || "").slice(0, 60),
				);
			}
		}

		// Form inputs
		const inputs = document.querySelectorAll(
			"input:not([type='hidden']):not([type='submit']):not([type='button']), select, textarea",
		);
		result.formInputs.total = inputs.length;
		for (const input of inputs) {
			const id = input.id;
			const hasLabel =
				(id && !!document.querySelector(`label[for="${id}"]`)) ||
				!!input.getAttribute("aria-label") ||
				!!input.getAttribute("aria-labelledby") ||
				!!input.closest("label");
			if (hasLabel) result.formInputs.withLabels++;
		}

		// Calculate score
		let points = 0;
		let maxPoints = 0;

		if (result.interactive.total > 0) {
			maxPoints += 30;
			points += (result.interactive.withNames / result.interactive.total) * 30;
		}
		if (result.images.total > 0) {
			maxPoints += 20;
			points += (result.images.withAlt / result.images.total) * 20;
		}
		if (result.formInputs.total > 0) {
			maxPoints += 20;
			points += (result.formInputs.withLabels / result.formInputs.total) * 20;
		}

		maxPoints += 30; // landmarks
		if (result.landmarks.main) points += 10;
		if (result.landmarks.nav) points += 10;
		if (result.landmarks.header) points += 5;
		if (result.landmarks.footer) points += 5;

		result.score = maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 100;

		// Limit arrays for response size
		result.interactive.missing = result.interactive.missing.slice(0, 10);
		result.images.missingAlt = result.images.missingAlt.slice(0, 10);

		return result;
	});
}

export function formatCoverageReport(result: CoverageResult): string {
	const lines: string[] = [];
	lines.push("Accessibility Coverage Report");
	lines.push("=".repeat(40));
	lines.push("");

	// Interactive elements
	const pctInteractive =
		result.interactive.total > 0
			? Math.round(
					(result.interactive.withNames / result.interactive.total) * 100,
				)
			: 100;
	lines.push("Interactive Elements");
	lines.push(
		`  ${result.interactive.withNames}/${result.interactive.total} (${pctInteractive}%) have accessible names`,
	);
	if (result.interactive.missing.length > 0) {
		for (const m of result.interactive.missing) {
			lines.push(`  [FAIL] ${m.role} at ${m.selector} — no accessible name`);
		}
	}
	lines.push("");

	// Images
	const pctImages =
		result.images.total > 0
			? Math.round((result.images.withAlt / result.images.total) * 100)
			: 100;
	lines.push("Images");
	lines.push(
		`  ${result.images.withAlt}/${result.images.total} (${pctImages}%) have alt text`,
	);
	if (result.images.missingAlt.length > 0) {
		for (const src of result.images.missingAlt) {
			lines.push(`  [FAIL] Missing alt: ${src}`);
		}
	}
	lines.push("");

	// Form inputs
	const pctForms =
		result.formInputs.total > 0
			? Math.round(
					(result.formInputs.withLabels / result.formInputs.total) * 100,
				)
			: 100;
	lines.push("Form Inputs");
	lines.push(
		`  ${result.formInputs.withLabels}/${result.formInputs.total} (${pctForms}%) have labels`,
	);
	lines.push("");

	// Landmarks
	lines.push("Landmarks");
	lines.push(`  ${result.landmarks.main ? "[PASS]" : "[FAIL]"} <main>`);
	lines.push(`  ${result.landmarks.nav ? "[PASS]" : "[FAIL]"} <nav>`);
	lines.push(`  ${result.landmarks.header ? "[PASS]" : "[WARN]"} <header>`);
	lines.push(`  ${result.landmarks.footer ? "[PASS]" : "[WARN]"} <footer>`);
	lines.push("");

	lines.push(`Coverage score: ${result.score}%`);
	return lines.join("\n");
}
