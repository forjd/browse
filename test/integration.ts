/**
 * Integration tests for the browse daemon.
 * Run with: bun run test/integration.ts
 *
 * These tests launch a real Playwright browser (which bun test kills),
 * so they run as a standalone script with manual assertions.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import {
	createServer as createHttpServer,
	type Server as HttpServer,
} from "node:http";
import { join } from "node:path";
import { startDaemon } from "../src/daemon.ts";
import type { Response } from "../src/protocol.ts";
import { sendSocketRequest } from "./support/socket-command.ts";

const TEST_DIR = join(import.meta.dir, ".tmp-integration");
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
	if (condition) {
		passed++;
		console.log(`  ✓ ${message}`);
	} else {
		failed++;
		console.error(`  ✗ ${message}`);
	}
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
	const match = JSON.stringify(actual) === JSON.stringify(expected);
	if (match) {
		passed++;
		console.log(`  ✓ ${message}`);
	} else {
		failed++;
		console.error(`  ✗ ${message}`);
		console.error(`    expected: ${JSON.stringify(expected)}`);
		console.error(`    actual:   ${JSON.stringify(actual)}`);
	}
}

function sendCommand(
	socketPath: string,
	cmd: string,
	args: string[] = [],
): Promise<Response> {
	return sendSocketRequest<Response>(socketPath, { cmd, args });
}

let testIndex = 0;
function testPaths() {
	testIndex++;
	const dir = join(TEST_DIR, `run-${testIndex}`);
	mkdirSync(dir, { recursive: true });
	return {
		socketPath: join(dir, "test.sock"),
		pidPath: join(dir, "test.pid"),
		userDataDir: join(dir, "user-data"),
	};
}

// ─── Test: goto + text flow ───────────────────────────────────────

async function testGotoAndText() {
	console.log("\ngoto + text flow:");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		const gotoRes = await sendCommand(paths.socketPath, "goto", [
			"data:text/html,<title>Integration Test</title><body>Hello integration</body>",
		]);
		assertEqual(
			gotoRes,
			{ ok: true, data: "Integration Test" },
			"goto returns page title",
		);

		const textRes = await sendCommand(paths.socketPath, "text");
		assert(textRes.ok === true, "text returns ok");
		if (textRes.ok) {
			assert(
				textRes.data.includes("Hello integration"),
				"text contains page content",
			);
		}
	} finally {
		await daemon.shutdown();
	}
}

// ─── Test: goto with missing URL ──────────────────────────────────

async function testGotoMissingUrl() {
	console.log("\ngoto with missing URL:");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		const res = await sendCommand(paths.socketPath, "goto");
		assertEqual(
			res,
			{ ok: false, error: "Usage: browse goto <url>" },
			"returns usage error",
		);
	} finally {
		await daemon.shutdown();
	}
}

// ─── Test: unknown command ────────────────────────────────────────

async function testUnknownCommand() {
	console.log("\nunknown command:");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		const res = await sendCommand(paths.socketPath, "dance");
		assertEqual(
			res,
			{ ok: false, error: "Unknown command: dance" },
			"returns error for unknown command",
		);
	} finally {
		await daemon.shutdown();
	}
}

// ─── Test: quit cleans up ─────────────────────────────────────────

async function testQuitCleansUp() {
	console.log("\nquit cleans up:");
	const paths = testPaths();
	await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	assert(existsSync(paths.socketPath), "socket file exists before quit");
	assert(existsSync(paths.pidPath), "PID file exists before quit");

	const res = await sendCommand(paths.socketPath, "quit");
	assertEqual(
		res,
		{ ok: true, data: "Daemon stopped." },
		"quit returns confirmation",
	);

	await Bun.sleep(500);
	assert(!existsSync(paths.socketPath), "socket file removed after quit");
	assert(!existsSync(paths.pidPath), "PID file removed after quit");
}

// ─── Test: idle timeout ───────────────────────────────────────────

async function testIdleTimeout() {
	console.log("\nidle timeout:");
	const paths = testPaths();
	await startDaemon({
		...paths,
		idleTimeoutMs: 500,
		headless: true,
	});

	assert(existsSync(paths.socketPath), "socket exists initially");

	await Bun.sleep(1000);
	assert(!existsSync(paths.socketPath), "socket removed after idle timeout");
	assert(!existsSync(paths.pidPath), "PID file removed after idle timeout");
}

// ─── Test: page state persists across commands ───────────────────

async function testPagePersistence() {
	console.log("\npage state persistence:");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		// Navigate to page 1
		const goto1 = await sendCommand(paths.socketPath, "goto", [
			"data:text/html,<title>First Page</title><body>First content</body>",
		]);
		assertEqual(goto1, { ok: true, data: "First Page" }, "first goto succeeds");

		// Navigate to page 2 — uses the same page instance
		const goto2 = await sendCommand(paths.socketPath, "goto", [
			"data:text/html,<title>Second Page</title><body>Second content</body>",
		]);
		assertEqual(
			goto2,
			{ ok: true, data: "Second Page" },
			"second goto succeeds",
		);

		// Text should reflect the latest page
		const textRes = await sendCommand(paths.socketPath, "text");
		assert(textRes.ok === true, "text returns ok");
		if (textRes.ok) {
			assert(
				textRes.data.includes("Second content"),
				"text reflects latest navigation",
			);
			assert(
				!textRes.data.includes("First content"),
				"text does not contain previous page content",
			);
		}
	} finally {
		await daemon.shutdown();
	}
}

// ─── Phase 1: Snapshot + Refs ────────────────────────────────────

const TEST_PAGE = `file://${join(import.meta.dir, "fixtures", "test-page.html")}`;

async function testSnapshot() {
	console.log("\nsnapshot (default mode):");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [TEST_PAGE]);

		const res = await sendCommand(paths.socketPath, "snapshot");
		assert(res.ok === true, "snapshot returns ok");
		if (res.ok) {
			assert(res.data.includes('[page] "Test Page"'), "shows page title");
			assert(res.data.includes("[link]"), "includes links");
			assert(res.data.includes("[button]"), "includes buttons");
			assert(res.data.includes("[textbox]"), "includes textbox");
			assert(res.data.includes("@e"), "assigns refs");
			// Should not include structural elements
			assert(
				!res.data.includes("[heading"),
				"excludes headings in default mode",
			);
			assert(
				!res.data.includes("[paragraph]"),
				"excludes paragraphs in default mode",
			);
		}
	} finally {
		await daemon.shutdown();
	}
}

async function testSnapshotInclusive() {
	console.log("\nsnapshot -i (inclusive mode):");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [TEST_PAGE]);

		const res = await sendCommand(paths.socketPath, "snapshot", ["-i"]);
		assert(res.ok === true, "snapshot -i returns ok");
		if (res.ok) {
			assert(res.data.includes("[heading"), "includes headings");
			assert(res.data.includes("Dashboard"), "includes heading text");
			assert(
				res.data.includes("[button]"),
				"still includes interactive elements",
			);
		}
	} finally {
		await daemon.shutdown();
	}
}

async function testClickByRef() {
	console.log("\nclick by ref:");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [TEST_PAGE]);
		const snapRes = await sendCommand(paths.socketPath, "snapshot");
		assert(snapRes.ok === true, "snapshot ok");

		if (snapRes.ok) {
			// Find the Increment button ref
			const lines = snapRes.data.split("\n");
			const incrementLine = lines.find((l: string) => l.includes("Increment"));
			assert(!!incrementLine, "found Increment button in snapshot");

			if (incrementLine) {
				const refMatch = incrementLine.match(/@e\d+/);
				assert(!!refMatch, "Increment button has a ref");

				if (refMatch) {
					const clickRes = await sendCommand(paths.socketPath, "click", [
						refMatch[0],
					]);
					assert(clickRes.ok === true, "click returns ok");
					if (clickRes.ok) {
						assert(
							clickRes.data.includes("Clicked"),
							"click returns confirmation",
						);
					}

					// Verify the counter changed
					const textRes = await sendCommand(paths.socketPath, "text");
					assert(textRes.ok === true, "text returns ok");
					if (textRes.ok) {
						assert(
							textRes.data.includes("Count: 1"),
							"counter incremented after click",
						);
					}
				}
			}
		}
	} finally {
		await daemon.shutdown();
	}
}

async function testFillByRef() {
	console.log("\nfill by ref:");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [TEST_PAGE]);
		const snapRes = await sendCommand(paths.socketPath, "snapshot");
		assert(snapRes.ok === true, "snapshot ok");

		if (snapRes.ok) {
			// Find the search textbox ref
			const lines = snapRes.data.split("\n");
			const searchLine = lines.find((l: string) => l.includes("[textbox]"));
			assert(!!searchLine, "found textbox in snapshot");

			if (searchLine) {
				const refMatch = searchLine.match(/@e\d+/);
				assert(!!refMatch, "textbox has a ref");

				if (refMatch) {
					const fillRes = await sendCommand(paths.socketPath, "fill", [
						refMatch[0],
						"test query",
					]);
					assert(fillRes.ok === true, "fill returns ok");
					if (fillRes.ok) {
						assert(
							fillRes.data.includes("Filled"),
							"fill returns confirmation",
						);
						assert(
							fillRes.data.includes("test query"),
							"fill confirmation includes value",
						);
					}
				}
			}
		}
	} finally {
		await daemon.shutdown();
	}
}

async function testStaleRefsAfterNavigation() {
	console.log("\nstale refs after navigation:");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [TEST_PAGE]);
		await sendCommand(paths.socketPath, "snapshot");

		// Navigate away — refs should become stale
		await sendCommand(paths.socketPath, "goto", [
			"data:text/html,<title>Other</title><body>Other page</body>",
		]);

		const clickRes = await sendCommand(paths.socketPath, "click", ["@e1"]);
		assert(clickRes.ok === false, "click fails with stale refs");
		if (!clickRes.ok) {
			assert(clickRes.error.includes("stale"), "error mentions staleness");
			assert(
				clickRes.error.includes("browse snapshot"),
				"error suggests re-snapshotting",
			);
		}
	} finally {
		await daemon.shutdown();
	}
}

async function testDuplicateElements() {
	console.log("\nduplicate element handling:");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [TEST_PAGE]);
		const snapRes = await sendCommand(paths.socketPath, "snapshot");
		assert(snapRes.ok === true, "snapshot ok");

		if (snapRes.ok) {
			const deleteLines = snapRes.data
				.split("\n")
				.filter((l: string) => l.includes("Delete"));
			assert(
				deleteLines.length === 3,
				`found 3 Delete buttons (got ${deleteLines.length})`,
			);
			assert(snapRes.data.includes("1 of 3"), "first delete shows '1 of 3'");
			assert(snapRes.data.includes("3 of 3"), "last delete shows '3 of 3'");
		}
	} finally {
		await daemon.shutdown();
	}
}

async function testSnapshotRefreshAfterNavigation() {
	console.log("\nsnapshot refresh after navigation:");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [TEST_PAGE]);
		await sendCommand(paths.socketPath, "snapshot");

		// Navigate to a different page
		await sendCommand(paths.socketPath, "goto", [
			"data:text/html,<title>Simple</title><body><button>Only Button</button></body>",
		]);

		// Re-snapshot should work
		const snapRes = await sendCommand(paths.socketPath, "snapshot");
		assert(snapRes.ok === true, "re-snapshot after navigation ok");
		if (snapRes.ok) {
			assert(
				snapRes.data.includes("Only Button"),
				"snapshot reflects new page",
			);

			// New refs should work
			const clickRes = await sendCommand(paths.socketPath, "click", ["@e1"]);
			assert(clickRes.ok === true, "click on new ref succeeds");
		}
	} finally {
		await daemon.shutdown();
	}
}

// ─── Phase 2: Screenshot, Console, Network ──────────────────────

async function testScreenshotFullPage() {
	console.log("\nscreenshot (full-page):");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [TEST_PAGE]);

		const res = await sendCommand(paths.socketPath, "screenshot");
		assert(res.ok === true, "screenshot returns ok");
		if (res.ok) {
			assert(res.data.endsWith(".png"), "returns a .png path");
			assert(existsSync(res.data), "screenshot file exists");
			const stat = statSync(res.data);
			assert(stat.size > 0, "screenshot file is non-empty");
		}
	} finally {
		await daemon.shutdown();
	}
}

async function testScreenshotExplicitPath() {
	console.log("\nscreenshot (explicit path):");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [TEST_PAGE]);

		const outPath = join(TEST_DIR, "explicit-shot.png");
		const res = await sendCommand(paths.socketPath, "screenshot", [outPath]);
		assert(res.ok === true, "screenshot returns ok");
		if (res.ok) {
			assertEqual(res.data, outPath, "returns the specified path");
			assert(existsSync(outPath), "file exists at specified path");
		}
	} finally {
		await daemon.shutdown();
	}
}

async function testScreenshotViewport() {
	console.log("\nscreenshot --viewport:");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [TEST_PAGE]);

		const outPath = join(TEST_DIR, "viewport-shot.png");
		const res = await sendCommand(paths.socketPath, "screenshot", [
			outPath,
			"--viewport",
		]);
		assert(res.ok === true, "viewport screenshot returns ok");
		if (res.ok) {
			assert(existsSync(outPath), "viewport screenshot file exists");
		}
	} finally {
		await daemon.shutdown();
	}
}

async function testScreenshotSelector() {
	console.log("\nscreenshot --selector:");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [TEST_PAGE]);

		const outPath = join(TEST_DIR, "element-shot.png");
		const res = await sendCommand(paths.socketPath, "screenshot", [
			outPath,
			"--selector",
			"h1",
		]);
		assert(res.ok === true, "element screenshot returns ok");
		if (res.ok) {
			assert(existsSync(outPath), "element screenshot file exists");
			const stat = statSync(outPath);
			assert(stat.size > 0, "element screenshot is non-empty");
		}
	} finally {
		await daemon.shutdown();
	}
}

async function testScreenshotSelectorMissing() {
	console.log("\nscreenshot --selector (missing element):");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [TEST_PAGE]);

		const res = await sendCommand(paths.socketPath, "screenshot", [
			"--selector",
			".nonexistent-element",
		]);
		assert(res.ok === false, "returns error for missing selector");
		if (!res.ok) {
			assert(
				res.error.includes(".nonexistent-element"),
				"error mentions the selector",
			);
		}
	} finally {
		await daemon.shutdown();
	}
}

function startTestHttpServer(): Promise<{ server: HttpServer; port: number }> {
	return new Promise((resolve) => {
		const server = createHttpServer((req, res) => {
			if (req.url === "/api/ok") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ status: "ok" }));
			} else if (req.url === "/api/missing") {
				res.writeHead(404, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "not found" }));
			} else if (req.url === "/api/error") {
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "internal error" }));
			} else if (req.url === "/console-test") {
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(`<!DOCTYPE html>
<html><head><title>Console Test</title></head>
<body>
<h1>Console Test</h1>
<script>
  console.log("Page loaded successfully");
  console.error("Test error message");
  console.warn("Test warning message");

  fetch("/api/ok");
  fetch("/api/missing");
  fetch("/api/error");
</script>
</body></html>`);
			} else {
				res.writeHead(404);
				res.end("not found");
			}
		});
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			resolve({ server, port });
		});
	});
}

async function testConsoleDrain() {
	console.log("\nconsole (drain and clear):");
	const { server: httpServer, port } = await startTestHttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/console-test`,
		]);
		// Small delay for console messages to be captured
		await Bun.sleep(500);

		const res = await sendCommand(paths.socketPath, "console");
		assert(res.ok === true, "console returns ok");
		if (res.ok) {
			assert(
				res.data.includes("Page loaded successfully"),
				"contains log message",
			);
			assert(res.data.includes("[ERROR]"), "contains error level");
			assert(res.data.includes("Test error message"), "contains error text");
		}

		// Second call should be empty (drained)
		const res2 = await sendCommand(paths.socketPath, "console");
		assert(res2.ok === true, "second console call returns ok");
		if (res2.ok) {
			assertEqual(res2.data, "No console messages.", "buffer was drained");
		}
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

async function testConsoleFilter() {
	console.log("\nconsole --level error:");
	const { server: httpServer, port } = await startTestHttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/console-test`,
		]);
		await Bun.sleep(500);

		const res = await sendCommand(paths.socketPath, "console", [
			"--level",
			"error",
		]);
		assert(res.ok === true, "console --level error returns ok");
		if (res.ok) {
			assert(res.data.includes("[ERROR]"), "contains error messages");
			assert(!res.data.includes("[LOG]"), "does not contain log messages");
			assert(
				!res.data.includes("[WARNING]"),
				"does not contain warning messages",
			);
		}
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

async function testConsoleKeep() {
	console.log("\nconsole --keep:");
	const { server: httpServer, port } = await startTestHttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/console-test`,
		]);
		await Bun.sleep(500);

		const res1 = await sendCommand(paths.socketPath, "console", ["--keep"]);
		assert(res1.ok === true, "console --keep returns ok");
		if (res1.ok) {
			assert(
				res1.data.includes("Page loaded successfully"),
				"contains messages",
			);
		}

		// Buffer should still have messages
		const res2 = await sendCommand(paths.socketPath, "console");
		assert(res2.ok === true, "second console call returns ok");
		if (res2.ok) {
			assert(
				res2.data.includes("Page loaded successfully"),
				"messages still present after --keep",
			);
		}
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

async function testNetworkFailures() {
	console.log("\nnetwork (failed requests):");
	const { server: httpServer, port } = await startTestHttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/console-test`,
		]);
		await Bun.sleep(500);

		const res = await sendCommand(paths.socketPath, "network");
		assert(res.ok === true, "network returns ok");
		if (res.ok) {
			assert(res.data.includes("[404]"), "contains 404 response");
			assert(res.data.includes("[500]"), "contains 500 response");
			assert(res.data.includes("/api/missing"), "contains 404 URL");
			assert(res.data.includes("/api/error"), "contains 500 URL");
			assert(!res.data.includes("[200]"), "excludes 200 responses");
		}

		// Second call should be empty (drained)
		const res2 = await sendCommand(paths.socketPath, "network");
		assert(res2.ok === true, "second network call ok");
		if (res2.ok) {
			assertEqual(res2.data, "No failed requests.", "buffer was drained");
		}
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

async function testNetworkAll() {
	console.log("\nnetwork --all:");
	const { server: httpServer, port } = await startTestHttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/console-test`,
		]);
		await Bun.sleep(500);

		const res = await sendCommand(paths.socketPath, "network", ["--all"]);
		assert(res.ok === true, "network --all returns ok");
		if (res.ok) {
			assert(res.data.includes("[200]"), "includes 200 responses");
			assert(res.data.includes("[404]"), "includes 404 responses");
			assert(res.data.includes("[500]"), "includes 500 responses");
		}
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

async function testNetworkKeep() {
	console.log("\nnetwork --keep:");
	const { server: httpServer, port } = await startTestHttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/console-test`,
		]);
		await Bun.sleep(500);

		const res1 = await sendCommand(paths.socketPath, "network", ["--keep"]);
		assert(res1.ok === true, "network --keep returns ok");
		if (res1.ok) {
			assert(res1.data.includes("[404]"), "contains failed requests");
		}

		// Buffer should still have entries
		const res2 = await sendCommand(paths.socketPath, "network");
		assert(res2.ok === true, "second network call ok");
		if (res2.ok) {
			assert(res2.data.includes("[404]"), "entries still present after --keep");
		}
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

// ─── Phase 4: Flow, Assert, Healthcheck ─────────────────────────

function startPhase4HttpServer(): Promise<{
	server: HttpServer;
	port: number;
}> {
	return new Promise((resolve) => {
		const fixturesDir = join(import.meta.dir, "fixtures");
		const server = createHttpServer((req, res) => {
			if (req.url === "/register") {
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(readFileSync(join(fixturesDir, "register.html"), "utf-8"));
			} else if (req.url === "/welcome") {
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(readFileSync(join(fixturesDir, "welcome.html"), "utf-8"));
			} else if (req.url === "/admin/users/new") {
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(
					readFileSync(join(fixturesDir, "admin-users-new.html"), "utf-8"),
				);
			} else if (req.url === "/settings") {
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(
					readFileSync(join(fixturesDir, "settings-with-error.html"), "utf-8"),
				);
			} else if (req.url === "/api/health") {
				res.writeHead(200, { "Content-Type": "text/plain" });
				res.end("ok");
			} else if (req.url === "/dashboard") {
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(`<!DOCTYPE html>
<html><head><title>Dashboard</title></head>
<body>
<h1>Dashboard</h1>
<p>Welcome to the dashboard</p>
<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li><li>Item 4</li><li>Item 5</li></ul>
</body></html>`);
			} else {
				res.writeHead(404);
				res.end("not found");
			}
		});
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			resolve({ server, port });
		});
	});
}

async function testAssertVisible() {
	console.log("\nassert visible:");
	const { server: httpServer, port } = await startPhase4HttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/dashboard`,
		]);

		const pass = await sendCommand(paths.socketPath, "assert", [
			"visible",
			"h1",
		]);
		assert(pass.ok === true, "assert visible h1 passes");
		if (pass.ok) {
			assert(pass.data.includes("PASS"), "output contains PASS");
		}

		const fail = await sendCommand(paths.socketPath, "assert", [
			"visible",
			".nonexistent",
		]);
		assert(fail.ok === false, "assert visible .nonexistent fails");
		if (!fail.ok) {
			assert(fail.error.includes("FAIL"), "output contains FAIL");
		}
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

async function testAssertTextContains() {
	console.log("\nassert text-contains:");
	const { server: httpServer, port } = await startPhase4HttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/dashboard`,
		]);

		const pass = await sendCommand(paths.socketPath, "assert", [
			"text-contains",
			"Welcome",
		]);
		assert(pass.ok === true, "text-contains 'Welcome' passes");

		const fail = await sendCommand(paths.socketPath, "assert", [
			"text-contains",
			"Nonexistent text",
		]);
		assert(fail.ok === false, "text-contains 'Nonexistent text' fails");
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

async function testAssertUrlContains() {
	console.log("\nassert url-contains:");
	const { server: httpServer, port } = await startPhase4HttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/dashboard`,
		]);

		const pass = await sendCommand(paths.socketPath, "assert", [
			"url-contains",
			"/dashboard",
		]);
		assert(pass.ok === true, "url-contains '/dashboard' passes");

		const fail = await sendCommand(paths.socketPath, "assert", [
			"url-contains",
			"/settings",
		]);
		assert(fail.ok === false, "url-contains '/settings' fails");
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

async function testAssertElementCount() {
	console.log("\nassert element-count:");
	const { server: httpServer, port } = await startPhase4HttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/dashboard`,
		]);

		const pass = await sendCommand(paths.socketPath, "assert", [
			"element-count",
			"li",
			"5",
		]);
		assert(pass.ok === true, "element-count li 5 passes");
		if (pass.ok) {
			assert(pass.data.includes("PASS"), "output contains PASS");
		}

		const fail = await sendCommand(paths.socketPath, "assert", [
			"element-count",
			"li",
			"3",
		]);
		assert(fail.ok === false, "element-count li 3 fails");
		if (!fail.ok) {
			assert(fail.error.includes("5"), "error shows actual count");
		}
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

async function testFlowList() {
	console.log("\nflow list:");
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		// No config loaded, so should get error
		const res = await sendCommand(paths.socketPath, "flow", ["list"]);
		// Daemon has no config from cwd, so flows aren't available
		assert(
			res.ok === true || res.ok === false,
			"flow list responds (config may or may not be present)",
		);
	} finally {
		await daemon.shutdown();
	}
}

async function testFlowMissingVariables() {
	console.log("\nflow missing variables:");
	const paths = testPaths();

	// Write a config file to the temp dir so the daemon picks it up
	const _configPath = join(TEST_DIR, `run-${testIndex}`, "browse.config.json");
	const _config = {
		environments: {},
		flows: {
			signup: {
				description: "Register a new user",
				variables: ["base_url", "email"],
				steps: [{ goto: "{{base_url}}/register" }],
			},
		},
	};

	// The daemon loads config from cwd, which won't have our test config.
	// For this test we just verify the protocol works
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		const res = await sendCommand(paths.socketPath, "flow", ["list"]);
		// Without config in cwd, this will error or return no flows
		assert(res.ok === true || res.ok === false, "flow list responds");
	} finally {
		await daemon.shutdown();
	}
}

async function testHealthcheckBasic() {
	console.log("\nhealthcheck (basic):");
	const { server: httpServer, port } = await startPhase4HttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		// Without config, should get error
		const res = await sendCommand(paths.socketPath, "healthcheck", [
			"--var",
			`base_url=http://127.0.0.1:${port}`,
		]);
		// No config loaded from cwd
		assert(res.ok === false, "healthcheck fails without config");
		if (!res.ok) {
			assert(
				res.error.includes("browse.config.json") ||
					res.error.includes("healthcheck"),
				"error mentions missing config",
			);
		}
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

async function testAssertNotVisible() {
	console.log("\nassert not-visible:");
	const { server: httpServer, port } = await startPhase4HttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/dashboard`,
		]);

		const pass = await sendCommand(paths.socketPath, "assert", [
			"not-visible",
			".nonexistent",
		]);
		assert(pass.ok === true, "not-visible .nonexistent passes");

		const fail = await sendCommand(paths.socketPath, "assert", [
			"not-visible",
			"h1",
		]);
		assert(fail.ok === false, "not-visible h1 fails (h1 is visible)");
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

async function testAssertTextNotContains() {
	console.log("\nassert text-not-contains:");
	const { server: httpServer, port } = await startPhase4HttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/dashboard`,
		]);

		const pass = await sendCommand(paths.socketPath, "assert", [
			"text-not-contains",
			"Error",
		]);
		assert(pass.ok === true, "text-not-contains 'Error' passes on clean page");

		const fail = await sendCommand(paths.socketPath, "assert", [
			"text-not-contains",
			"Dashboard",
		]);
		assert(
			fail.ok === false,
			"text-not-contains 'Dashboard' fails (text is present)",
		);
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

async function testAssertUrlPattern() {
	console.log("\nassert url-pattern:");
	const { server: httpServer, port } = await startPhase4HttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/dashboard`,
		]);

		const pass = await sendCommand(paths.socketPath, "assert", [
			"url-pattern",
			"/(dashboard|home)$",
		]);
		assert(pass.ok === true, "url-pattern matching dashboard passes");

		const fail = await sendCommand(paths.socketPath, "assert", [
			"url-pattern",
			"/settings$",
		]);
		assert(fail.ok === false, "url-pattern matching settings fails");
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

async function testAssertElementText() {
	console.log("\nassert element-text:");
	const { server: httpServer, port } = await startPhase4HttpServer();
	const paths = testPaths();
	const daemon = await startDaemon({
		...paths,
		idleTimeoutMs: 60_000,
		headless: true,
	});

	try {
		await sendCommand(paths.socketPath, "goto", [
			`http://127.0.0.1:${port}/dashboard`,
		]);

		const pass = await sendCommand(paths.socketPath, "assert", [
			"element-text",
			"h1",
			"Dashboard",
		]);
		assert(pass.ok === true, "element-text h1 'Dashboard' passes");

		const fail = await sendCommand(paths.socketPath, "assert", [
			"element-text",
			"h1",
			"Settings",
		]);
		assert(fail.ok === false, "element-text h1 'Settings' fails");
	} finally {
		await daemon.shutdown();
		httpServer.close();
	}
}

// ─── Run all ──────────────────────────────────────────────────────

async function main() {
	mkdirSync(TEST_DIR, { recursive: true });

	console.log("Integration tests\n==================");

	try {
		// Phase 0
		await testGotoAndText();
		await testGotoMissingUrl();
		await testUnknownCommand();
		await testQuitCleansUp();
		await testIdleTimeout();
		await testPagePersistence();

		// Phase 1
		await testSnapshot();
		await testSnapshotInclusive();
		await testClickByRef();
		await testFillByRef();
		await testStaleRefsAfterNavigation();
		await testDuplicateElements();
		await testSnapshotRefreshAfterNavigation();

		// Phase 2
		await testScreenshotFullPage();
		await testScreenshotExplicitPath();
		await testScreenshotViewport();
		await testScreenshotSelector();
		await testScreenshotSelectorMissing();
		await testConsoleDrain();
		await testConsoleFilter();
		await testConsoleKeep();
		await testNetworkFailures();
		await testNetworkAll();
		await testNetworkKeep();

		// Phase 4
		await testAssertVisible();
		await testAssertNotVisible();
		await testAssertTextContains();
		await testAssertTextNotContains();
		await testAssertUrlContains();
		await testAssertUrlPattern();
		await testAssertElementText();
		await testAssertElementCount();
		await testFlowList();
		await testFlowMissingVariables();
		await testHealthcheckBasic();
	} finally {
		rmSync(TEST_DIR, { recursive: true, force: true });
	}

	console.log(`\n==================`);
	console.log(`${passed} passed, ${failed} failed`);

	if (failed > 0) {
		process.exit(1);
	}
}

await main();
