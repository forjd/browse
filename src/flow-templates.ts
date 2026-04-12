import type { FlowConfig } from "./config.ts";

type FlowTemplateDefinition = {
	summary: string;
	flow: FlowConfig;
};

const FLOW_TEMPLATES: Record<string, FlowTemplateDefinition> = {
	smoke: {
		summary: "Open a URL and verify expected text",
		flow: {
			description: "Smoke-test a page load and verify expected text",
			variables: ["url", "expected_text"],
			steps: [
				{ goto: "{{url}}" },
				{ assert: { textContains: "{{expected_text}}" } },
				{ screenshot: true },
			],
		},
	},
	"login-smoke": {
		summary: "Sign in to an environment and verify a post-login cue",
		flow: {
			description:
				"Log in to a configured environment and verify a post-login cue",
			variables: ["environment", "expected_text"],
			steps: [
				{ wipe: true },
				{ login: "{{environment}}" },
				{ assert: { textContains: "{{expected_text}}" } },
				{ screenshot: true },
			],
		},
	},
};

export function getFlowTemplate(
	name: string,
): FlowTemplateDefinition | undefined {
	return FLOW_TEMPLATES[name];
}

export function getFlowTemplateNames(): string[] {
	return Object.keys(FLOW_TEMPLATES).sort();
}

export function formatFlowTemplateList(): string {
	return getFlowTemplateNames()
		.map((name) => `  ${name}  ${FLOW_TEMPLATES[name].summary}`)
		.join("\n");
}
