/**
 * Shared stress-scene server management for the profiling scripts in this
 * folder. Makes every script self-contained:
 *
 *   - if nothing is listening on the stress port (5174 by default, override
 *     with STRESS_PORT), it starts the stress Vite server itself from the
 *     repo root (`vite --config stress/vite.config.ts`) and stops it again
 *     when the script exits (normal exit, Ctrl-C, or SIGTERM);
 *   - if a server is already running there (e.g. a manual
 *     `npm run dev:stress`), it reuses it and leaves it alone.
 *
 * Either way the scripts open the stress page (`/stress/index.stress.html`)
 * directly — the main menu and the usual user flow are never involved.
 * (The bare `/index.stress.html` path is caught by Vite's SPA fallback and
 * would serve the main app, so the full path is required.)
 *
 * Usage (from any script in this folder, before `page.goto`):
 *   import { ensureStressServer, STRESS_URL } from "./stress-server.mjs";
 *   await ensureStressServer();
 *   ... await page.goto(STRESS_URL) ...
 *
 * Run scripts from the repo root so artifacts land in `profiling/` next to
 * the repo (e.g. `node stress/scripts/fps-trend.mjs --metal`).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const PORT = Number(process.env.STRESS_PORT ?? 5174);
export const STRESS_URL = `http://localhost:${PORT}/stress/index.stress.html`;

const serverProc = { proc: null, started: false };

const portBusy = async () => {
  try {
    const res = await fetch(`http://localhost:${PORT}/`, {
      signal: AbortSignal.timeout(750),
    });
    return res.ok;
  } catch {
    return false;
  }
};

/** Polls until the URL answers 200, or the timeout (or a dead server) hits. */
const waitReady = async (url, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const proc = serverProc.proc;
    if (proc && serverProc.started && (proc.exitCode !== null || proc.signalCode)) {
      throw new Error(
        "stress dev server exited during startup; check its output above (is port " +
          PORT +
          " already taken by a non-stress server?)"
      );
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      throw new Error(
        `stress page not ready at ${url} within ${Math.round(timeoutMs / 1000)}s`
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }
};

const stopServer = () => {
  const proc = serverProc.proc;
  if (!proc || proc.exitCode !== null || proc.signalCode) return;
  try {
    // Kill the whole process group (vite plus its esbuild service) on POSIX.
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    try {
      proc.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
  serverProc.proc = null;
};

let ensured = false;
export const ensureStressServer = async () => {
  if (ensured) return;
  ensured = true;

  if (await portBusy()) {
    console.log(`[stress] reusing the server already running on port ${PORT}`);
  } else {
    const viteBin = path.join(REPO_ROOT, "node_modules", "vite", "bin", "vite.js");
    if (!existsSync(viteBin)) {
      throw new Error(
        `vite not found at ${viteBin}; run \`npm install\` in the repo root first`
      );
    }
    console.log(
      `[stress] no server on port ${PORT}; starting the stress dev server (vite --config stress/vite.config.ts)...`
    );
    const proc = spawn(
      "node",
      [
        viteBin,
        "--config",
        "stress/vite.config.ts",
        "--port",
        String(PORT),
        "--strictPort",
      ],
      { cwd: REPO_ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    proc.stdout.on("data", () => {}); // drain, keep the terminal for our output
    proc.stderr.on("data", (d) => process.stderr.write(d));
    serverProc.proc = proc;
    serverProc.started = true;
    process.on("exit", stopServer);
    process.on("SIGINT", () => {
      stopServer();
      process.exit(130);
    });
    process.on("SIGTERM", () => {
      stopServer();
      process.exit(143);
    });
    await waitReady(`http://localhost:${PORT}/`, 60_000);
    console.log(`[stress] stress server is up on port ${PORT}`);
  }

  // The stress entry itself must answer (catches a server that is not the
  // stress one, e.g. the default app parked on the same port).
  await waitReady(STRESS_URL, 30_000);
};

/**
 * Final step for the browser scripts: close the Playwright browser, then stop
 * the server this process started and terminate. The server's stdout/stderr
 * pipes (kept open to drain its output) otherwise hold the Node event loop
 * alive long after the script's work is done, so the process would never exit
 * on its own. Bounding `browser.close()` with a timeout covers a SwiftShader
 * (no `--metal`) close that hangs after the report is already printed.
 */
export const safeClose = async (browser, timeoutMs = 15_000) => {
  await Promise.race([
    browser.close().catch(() => {}),
    new Promise((r) => setTimeout(() => {}, timeoutMs)),
  ]);
  stopServer();
  process.exit(0);
};
