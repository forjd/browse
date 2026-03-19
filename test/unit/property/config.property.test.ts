import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { validateConfig } from "../../../src/config.ts";

/** Arbitrary for a valid success condition */
const arbSuccessCondition = fc.oneof(
	fc.record({ urlContains: fc.string({ minLength: 1 }) }),
	fc.record({ urlPattern: fc.string({ minLength: 1 }) }),
	fc.record({ elementVisible: fc.string({ minLength: 1 }) }),
);

/** Arbitrary for a valid environment config */
const arbEnvironment = fc.record({
	loginUrl: fc.webUrl(),
	userEnvVar: fc.string({ minLength: 1, maxLength: 30 }),
	passEnvVar: fc.string({ minLength: 1, maxLength: 30 }),
	successCondition: arbSuccessCondition,
});

/** Arbitrary for a valid minimal config */
const arbValidConfig = fc
	.array(
		fc.tuple(
			fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^\w+$/.test(s)),
			arbEnvironment,
		),
		{ minLength: 1, maxLength: 5 },
	)
	.map((entries) => ({
		environments: Object.fromEntries(entries),
	}));

/** Arbitrary for a valid flow step */
const arbFlowStep: fc.Arbitrary<Record<string, unknown>> = fc.oneof(
	fc.record({ goto: fc.webUrl() }),
	fc.record({ click: fc.string({ minLength: 1 }) }),
	fc.record({ screenshot: fc.constant(true) }),
	fc.record({ snapshot: fc.constant(true) }),
	fc.record({ network: fc.constant(true) }),
);

/** Arbitrary for a valid flow condition */
const arbFlowCondition = fc.oneof(
	fc.record({ urlContains: fc.string({ minLength: 1 }) }),
	fc.record({ elementVisible: fc.string({ minLength: 1 }) }),
	fc.record({ textVisible: fc.string({ minLength: 1 }) }),
);

describe("config validation — property-based tests", () => {
	test("valid configs always pass validation", () => {
		fc.assert(
			fc.property(arbValidConfig, (config) => {
				const result = validateConfig(config);
				expect(result).toBeNull();
			}),
		);
	});

	test("validation never throws — always returns string or null", () => {
		fc.assert(
			fc.property(fc.anything(), (data) => {
				const result = validateConfig(data);
				expect(result === null || typeof result === "string").toBe(true);
			}),
		);
	});

	test("missing environments always produces an error", () => {
		fc.assert(
			fc.property(
				fc.record({
					flows: fc.constant({}),
					timeout: fc.integer({ min: 1, max: 60000 }),
				}),
				(config) => {
					const result = validateConfig(config);
					expect(result).not.toBeNull();
					expect(result).toContain("environments");
				},
			),
		);
	});

	test("removing a required field from any environment produces an error", () => {
		const requiredFields = [
			"loginUrl",
			"userEnvVar",
			"passEnvVar",
			"successCondition",
		] as const;

		fc.assert(
			fc.property(
				arbValidConfig,
				fc.constantFrom(...requiredFields),
				(config, fieldToRemove) => {
					// Pick the first environment and remove a required field
					const envNames = Object.keys(config.environments);
					if (envNames.length === 0) return;

					const broken = JSON.parse(JSON.stringify(config));
					delete broken.environments[envNames[0]][fieldToRemove];

					const result = validateConfig(broken);
					expect(result).not.toBeNull();
				},
			),
		);
	});

	test("valid config with flows passes validation", () => {
		fc.assert(
			fc.property(
				arbValidConfig,
				fc.array(
					fc.tuple(
						fc
							.string({ minLength: 1, maxLength: 20 })
							.filter((s) => /^\w+$/.test(s)),
						fc.array(arbFlowStep, { minLength: 1, maxLength: 5 }),
					),
					{ minLength: 1, maxLength: 3 },
				),
				(config, flowEntries) => {
					const withFlows = {
						...config,
						flows: Object.fromEntries(
							flowEntries.map(([name, steps]) => [name, { steps }]),
						),
					};

					const result = validateConfig(withFlows);
					expect(result).toBeNull();
				},
			),
		);
	});

	test("flow with empty steps always fails", () => {
		fc.assert(
			fc.property(arbValidConfig, (config) => {
				const withEmptyFlow = {
					...config,
					flows: {
						broken: { steps: [] },
					},
				};

				const result = validateConfig(withEmptyFlow);
				expect(result).not.toBeNull();
			}),
		);
	});

	test("valid config with if/while flow steps passes validation", () => {
		fc.assert(
			fc.property(
				arbValidConfig,
				arbFlowCondition,
				fc.array(arbFlowStep, { minLength: 1, maxLength: 3 }),
				(config, condition, thenSteps) => {
					const withConditionalFlow = {
						...config,
						flows: {
							conditional: {
								// biome-ignore lint/suspicious/noThenProperty: testing config validation for if/then flow steps
								steps: [{ if: { condition, then: thenSteps } }],
							},
						},
					};

					const result = validateConfig(withConditionalFlow);
					expect(result).toBeNull();
				},
			),
		);
	});

	test("valid config with while loop passes validation", () => {
		fc.assert(
			fc.property(
				arbValidConfig,
				arbFlowCondition,
				fc.array(arbFlowStep, { minLength: 1, maxLength: 3 }),
				fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
				(config, condition, steps, maxIterations) => {
					const whileStep: Record<string, unknown> = {
						while: {
							condition,
							steps,
							...(maxIterations !== undefined && { maxIterations }),
						},
					};
					const withWhileFlow = {
						...config,
						flows: {
							loop: { steps: [whileStep] },
						},
					};

					const result = validateConfig(withWhileFlow);
					expect(result).toBeNull();
				},
			),
		);
	});

	test("invalid flow step type always rejected", () => {
		fc.assert(
			fc.property(
				arbValidConfig,
				fc
					.string({ minLength: 1, maxLength: 20 })
					.filter(
						(s) =>
							![
								"goto",
								"click",
								"fill",
								"select",
								"screenshot",
								"console",
								"network",
								"wait",
								"assert",
								"login",
								"snapshot",
								"if",
								"while",
							].includes(s),
					),
				(config, badKey) => {
					const withBadFlow = {
						...config,
						flows: {
							broken: { steps: [{ [badKey]: "value" }] },
						},
					};

					const result = validateConfig(withBadFlow);
					expect(result).not.toBeNull();
				},
			),
		);
	});
});
