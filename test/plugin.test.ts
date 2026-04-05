import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowsePlugin } from "../src/plugin.ts";
import {
	createEmptyRegistry,
	discoverPluginPaths,
	getPluginSessionState,
	loadPlugins,
	runAfterHooks,
	runBeforeHooks,
	runCleanupHooks,
	validatePlugin,
} from "../src/plugin-loader.ts";
import { BUILTIN_COMMANDS, parseRequest } from "../src/protocol.ts";

// ── validatePlugin ──────────────────────────────────────────────────

describe("validatePlugin", () => {
	test("accepts a valid plugin with commands and hooks", () => {
		const plugin: BrowsePlugin = {
			name: "test-plugin",
			version: "1.0.0",
			commands: [
				{
					name: "greet",
					summary: "Say hello",
					usage: "browse greet",
					handler: async () => ({ ok: true, data: "hello" }),
				},
			],
			hooks: {
				init: async () => {},
				cleanup: async () => {},
			},
		};
		const result = validatePlugin(plugin, "/fake/path.ts");
		expect(typeof result).toBe("object");
		expect((result as BrowsePlugin).name).toBe("test-plugin");
	});

	test("accepts a minimal plugin with no commands or hooks", () => {
		const result = validatePlugin(
			{ name: "minimal", version: "0.1.0" },
			"/fake/path.ts",
		);
		expect(typeof result).toBe("object");
	});

	test("rejects null", () => {
		const result = validatePlugin(null, "/fake/path.ts");
		expect(typeof result).toBe("string");
		expect(result).toContain("does not export an object");
	});

	test("rejects non-object", () => {
		const result = validatePlugin("not an object", "/fake/path.ts");
		expect(typeof result).toBe("string");
	});

	test("rejects missing name", () => {
		const result = validatePlugin({ version: "1.0.0" }, "/fake/path.ts");
		expect(typeof result).toBe("string");
		expect(result).toContain("missing a 'name'");
	});

	test("rejects empty name", () => {
		const result = validatePlugin(
			{ name: "", version: "1.0.0" },
			"/fake/path.ts",
		);
		expect(typeof result).toBe("string");
		expect(result).toContain("missing a 'name'");
	});

	test("rejects missing version", () => {
		const result = validatePlugin({ name: "foo" }, "/fake/path.ts");
		expect(typeof result).toBe("string");
		expect(result).toContain("missing a 'version'");
	});

	test("rejects commands that are not an array", () => {
		const result = validatePlugin(
			{ name: "foo", version: "1.0.0", commands: "bad" },
			"/fake/path.ts",
		);
		expect(typeof result).toBe("string");
		expect(result).toContain("'commands' must be an array");
	});

	test("rejects command missing handler", () => {
		const result = validatePlugin(
			{
				name: "foo",
				version: "1.0.0",
				commands: [{ name: "cmd", summary: "s", usage: "u" }],
			},
			"/fake/path.ts",
		);
		expect(typeof result).toBe("string");
		expect(result).toContain("missing a 'handler'");
	});

	test("rejects command missing summary", () => {
		const result = validatePlugin(
			{
				name: "foo",
				version: "1.0.0",
				commands: [
					{
						name: "cmd",
						usage: "u",
						handler: async () => ({ ok: true, data: "" }),
					},
				],
			},
			"/fake/path.ts",
		);
		expect(typeof result).toBe("string");
		expect(result).toContain("missing a 'summary'");
	});

	test("rejects hooks that are not an object", () => {
		const result = validatePlugin(
			{ name: "foo", version: "1.0.0", hooks: "bad" },
			"/fake/path.ts",
		);
		expect(typeof result).toBe("string");
		expect(result).toContain("'hooks' must be an object");
	});

	test("rejects hook that is not a function", () => {
		const result = validatePlugin(
			{ name: "foo", version: "1.0.0", hooks: { init: "not a function" } },
			"/fake/path.ts",
		);
		expect(typeof result).toBe("string");
		expect(result).toContain("hooks.init must be a function");
	});

	test("rejects command with non-string-array flags", () => {
		const result = validatePlugin(
			{
				name: "foo",
				version: "1.0.0",
				commands: [
					{
						name: "cmd",
						summary: "s",
						usage: "u",
						flags: [123],
						handler: async () => ({ ok: true, data: "" }),
					},
				],
			},
			"/fake/path.ts",
		);
		expect(typeof result).toBe("string");
		expect(result).toContain("'flags' must be a string array");
	});
});

// ── loadPlugins ─────────────────────────────────────────────────────

describe("loadPlugins", () => {
	const tmpDir = join(tmpdir(), `browse-plugin-test-${Date.now()}`);

	function writePlugin(filename: string, content: string): string {
		const path = join(tmpDir, filename);
		writeFileSync(path, content);
		return path;
	}

	test("loads a valid plugin from a .ts file", async () => {
		mkdirSync(tmpDir, { recursive: true });
		const path = writePlugin(
			"good-plugin.ts",
			`export default {
				name: "good",
				version: "1.0.0",
				commands: [{
					name: "test-cmd",
					summary: "A test command",
					usage: "browse test-cmd",
					handler: async () => ({ ok: true, data: "works" }),
				}],
			};`,
		);

		const { registry, errors } = await loadPlugins(
			[path],
			null,
			BUILTIN_COMMANDS,
		);

		expect(errors).toHaveLength(0);
		expect(registry.plugins.has("good")).toBe(true);
		expect(registry.commands.has("test-cmd")).toBe(true);

		rmSync(tmpDir, { recursive: true, force: true });
	});

	test("reports error for non-existent file", async () => {
		const { registry, errors } = await loadPlugins(
			["/nonexistent/plugin.ts"],
			null,
			BUILTIN_COMMANDS,
		);

		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("Failed to load plugin");
		expect(registry.plugins.size).toBe(0);
	});

	test("rejects plugin commands that collide with built-in commands", async () => {
		mkdirSync(tmpDir, { recursive: true });
		const path = writePlugin(
			"collide-builtin.ts",
			`export default {
				name: "collider",
				version: "1.0.0",
				commands: [{
					name: "goto",
					summary: "Override goto",
					usage: "browse goto",
					handler: async () => ({ ok: true, data: "nope" }),
				}],
			};`,
		);

		const { registry, errors } = await loadPlugins(
			[path],
			null,
			BUILTIN_COMMANDS,
		);

		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("conflicts with a built-in command");
		expect(registry.commands.has("goto")).toBe(false);
		// Plugin itself is still registered (only the colliding command is skipped)
		expect(registry.plugins.has("collider")).toBe(true);

		rmSync(tmpDir, { recursive: true, force: true });
	});

	test("rejects duplicate plugin names", async () => {
		mkdirSync(tmpDir, { recursive: true });
		const path1 = writePlugin(
			"dup1.ts",
			`export default { name: "dup", version: "1.0.0" };`,
		);
		const path2 = writePlugin(
			"dup2.ts",
			`export default { name: "dup", version: "2.0.0" };`,
		);

		const { errors } = await loadPlugins(
			[path1, path2],
			null,
			BUILTIN_COMMANDS,
		);

		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("same name is already loaded");

		rmSync(tmpDir, { recursive: true, force: true });
	});

	test("rejects plugin commands that collide with other plugins", async () => {
		mkdirSync(tmpDir, { recursive: true });
		const path1 = writePlugin(
			"first.ts",
			`export default {
				name: "first",
				version: "1.0.0",
				commands: [{
					name: "shared-cmd",
					summary: "First",
					usage: "browse shared-cmd",
					handler: async () => ({ ok: true, data: "first" }),
				}],
			};`,
		);
		const path2 = writePlugin(
			"second.ts",
			`export default {
				name: "second",
				version: "1.0.0",
				commands: [{
					name: "shared-cmd",
					summary: "Second",
					usage: "browse shared-cmd",
					handler: async () => ({ ok: true, data: "second" }),
				}],
			};`,
		);

		const { registry, errors } = await loadPlugins(
			[path1, path2],
			null,
			BUILTIN_COMMANDS,
		);

		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("conflicts with plugin 'first'");
		// First plugin's command wins
		expect(registry.commands.get("shared-cmd")?.plugin).toBe("first");

		rmSync(tmpDir, { recursive: true, force: true });
	});

	test("registers lifecycle hooks", async () => {
		mkdirSync(tmpDir, { recursive: true });
		const path = writePlugin(
			"hooks-plugin.ts",
			`export default {
				name: "hooked",
				version: "1.0.0",
				hooks: {
					beforeCommand: async () => {},
					afterCommand: async () => {},
					cleanup: async () => {},
				},
			};`,
		);

		const { registry, errors } = await loadPlugins(
			[path],
			null,
			BUILTIN_COMMANDS,
		);

		expect(errors).toHaveLength(0);
		expect(registry.hooks.beforeCommand).toHaveLength(1);
		expect(registry.hooks.afterCommand).toHaveLength(1);
		expect(registry.hooks.cleanup).toHaveLength(1);

		rmSync(tmpDir, { recursive: true, force: true });
	});

	test("continues loading when init hook throws", async () => {
		mkdirSync(tmpDir, { recursive: true });
		const path = writePlugin(
			"bad-init.ts",
			`export default {
				name: "bad-init",
				version: "1.0.0",
				hooks: {
					init: async () => { throw new Error("init boom"); },
				},
			};`,
		);

		const { registry, errors } = await loadPlugins(
			[path],
			null,
			BUILTIN_COMMANDS,
		);

		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("init hook failed");
		// Plugin is still registered despite init failure
		expect(registry.plugins.has("bad-init")).toBe(true);

		rmSync(tmpDir, { recursive: true, force: true });
	});
});

// ── discoverPluginPaths ─────────────────────────────────────────────

describe("discoverPluginPaths", () => {
	test("returns empty array when no plugins configured and no global dir", () => {
		const paths = discoverPluginPaths(undefined, null);
		// May include global plugins if ~/.browse/plugins/ exists, but
		// should not throw
		expect(Array.isArray(paths)).toBe(true);
	});

	test("resolves relative paths from config directory", () => {
		const paths = discoverPluginPaths(
			["./plugins/my-plugin.ts"],
			"/home/user/project/browse.config.json",
		);
		expect(paths[0]).toBe("/home/user/project/plugins/my-plugin.ts");
	});

	test("preserves absolute paths", () => {
		const paths = discoverPluginPaths(
			["/absolute/path/plugin.ts"],
			"/home/user/browse.config.json",
		);
		expect(paths[0]).toBe("/absolute/path/plugin.ts");
	});

	test("preserves bare package names", () => {
		const paths = discoverPluginPaths(
			["browse-plugin-foo"],
			"/home/user/browse.config.json",
		);
		expect(paths[0]).toBe("browse-plugin-foo");
	});
});

// ── Hooks execution ─────────────────────────────────────────────────

describe("runBeforeHooks", () => {
	const dummyCtx = {
		page: {} as never,
		context: {} as never,
		config: null,
		args: [],
		sessionState: {},
		request: {},
	};

	test("returns undefined when no hooks are registered", async () => {
		const registry = createEmptyRegistry();
		const result = await runBeforeHooks(registry, "goto", dummyCtx);
		expect(result).toBeUndefined();
	});

	test("returns Response when a hook short-circuits", async () => {
		const registry = createEmptyRegistry();
		registry.hooks.beforeCommand.push({
			plugin: "blocker",
			hook: async () => ({ ok: false, error: "blocked" }),
		});

		const result = await runBeforeHooks(registry, "goto", dummyCtx);
		expect(result).toEqual({ ok: false, error: "blocked" });
	});

	test("returns error response when a hook throws", async () => {
		const registry = createEmptyRegistry();
		registry.hooks.beforeCommand.push({
			plugin: "thrower",
			hook: async () => {
				throw new Error("hook boom");
			},
		});

		const result = await runBeforeHooks(registry, "goto", dummyCtx);
		expect(result?.ok).toBe(false);
		expect((result as any).error).toContain("hook boom");
	});

	test("runs hooks in order, stops at first short-circuit", async () => {
		const calls: string[] = [];
		const registry = createEmptyRegistry();
		registry.hooks.beforeCommand.push({
			plugin: "first",
			hook: async () => {
				calls.push("first");
			},
		});
		registry.hooks.beforeCommand.push({
			plugin: "blocker",
			hook: async () => {
				calls.push("blocker");
				return { ok: false, error: "stop" };
			},
		});
		registry.hooks.beforeCommand.push({
			plugin: "never",
			hook: async () => {
				calls.push("never");
			},
		});

		await runBeforeHooks(registry, "goto", dummyCtx);
		expect(calls).toEqual(["first", "blocker"]);
	});
});

describe("runAfterHooks", () => {
	const dummyCtx = {
		page: {} as never,
		context: {} as never,
		config: null,
		args: [],
		sessionState: {},
		request: {},
	};

	test("runs all hooks even when one throws", async () => {
		const calls: string[] = [];
		const registry = createEmptyRegistry();
		registry.hooks.afterCommand.push({
			plugin: "thrower",
			hook: async () => {
				calls.push("thrower");
				throw new Error("boom");
			},
		});
		registry.hooks.afterCommand.push({
			plugin: "survivor",
			hook: async () => {
				calls.push("survivor");
			},
		});

		await runAfterHooks(registry, "goto", dummyCtx, {
			ok: true,
			data: "test",
		});
		expect(calls).toEqual(["thrower", "survivor"]);
	});
});

describe("runCleanupHooks", () => {
	test("runs all cleanup hooks even when one throws", async () => {
		const calls: string[] = [];
		const registry = createEmptyRegistry();
		registry.hooks.cleanup.push({
			plugin: "thrower",
			hook: async () => {
				calls.push("thrower");
				throw new Error("cleanup boom");
			},
		});
		registry.hooks.cleanup.push({
			plugin: "ok",
			hook: async () => {
				calls.push("ok");
			},
		});

		await runCleanupHooks(registry);
		expect(calls).toEqual(["thrower", "ok"]);
	});
});

// ── getPluginSessionState ───────────────────────────────────────────

describe("getPluginSessionState", () => {
	test("creates state on first access", () => {
		const map = new Map<string, Record<string, unknown>>();
		const state = getPluginSessionState(map, "my-plugin");
		expect(state).toEqual({});
		expect(map.has("my-plugin")).toBe(true);
	});

	test("returns same state on subsequent access", () => {
		const map = new Map<string, Record<string, unknown>>();
		const state1 = getPluginSessionState(map, "my-plugin");
		state1.counter = 42;
		const state2 = getPluginSessionState(map, "my-plugin");
		expect(state2.counter).toBe(42);
		expect(state1).toBe(state2);
	});

	test("isolates state per plugin name", () => {
		const map = new Map<string, Record<string, unknown>>();
		const stateA = getPluginSessionState(map, "plugin-a");
		const stateB = getPluginSessionState(map, "plugin-b");
		stateA.value = "a";
		stateB.value = "b";
		expect(stateA.value).toBe("a");
		expect(stateB.value).toBe("b");
	});
});

// ── parseRequest with plugin commands ───────────────────────────────

describe("parseRequest with extraCommands", () => {
	test("accepts a plugin command when passed as extraCommands", () => {
		const extra = new Set(["my-plugin-cmd"]);
		const result = parseRequest(
			'{"cmd":"my-plugin-cmd","args":["foo"]}',
			extra,
		);
		expect(result.cmd as string).toBe("my-plugin-cmd");
		expect(result.args).toEqual(["foo"]);
	});

	test("rejects unknown command when not in extraCommands", () => {
		expect(() => parseRequest('{"cmd":"nonexistent","args":[]}')).toThrow(
			"Unknown command: nonexistent",
		);
	});

	test("still accepts built-in commands without extraCommands", () => {
		const result = parseRequest(
			'{"cmd":"goto","args":["https://example.com"]}',
		);
		expect(result.cmd).toBe("goto");
	});
});
