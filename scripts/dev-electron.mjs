// Launches the Electron main process in dev mode. A plain npm script cannot
// set VITE_DEV_SERVER_URL in a cross-platform way ("VAR=x electron ." only
// works in POSIX shells, so it fails on Windows cmd.exe), so the variable is
// set here. `electron .` resolves the app via the "main" field in
// package.json (electron/dist/main.js).
//
// The dev server must be running before Electron launches, or the window just
// shows ERR_CONNECTION_REFUSED (a blank, unusable app). Previously this
// assumed Vite was already up (only true when running via `dev:desktop`,
// which starts it with concurrently). Now the dev server is started here if
// it is not already listening, and shut down again when the window closes —
// so `npm run dev:electron` works on its own.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// require("electron") resolves to the platform executable directly (not the
// .cmd shim that the .bin entry points to), so spawn works on every OS.
const electronBinary = require("electron");
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";

const isServerUp = async () => {
  try {
    const res = await fetch(DEV_SERVER_URL, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
};

const waitForServer = async (timeoutMs = 90_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isServerUp()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};

// Returns the Vite child process if we had to start it, or null when a dev
// server was already running (e.g. under `dev:desktop`'s concurrently). Only
// a process we started ourselves is torn down on exit.
const ensureDevServer = async () => {
  if (await isServerUp()) return null;

  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
  console.log(`No dev server at ${DEV_SERVER_URL}; starting Vite…`);
  const vite = spawn(npmBin, ["run", "dev"], {
    cwd: root,
    stdio: "inherit",
  });
  vite.on("error", (error) => {
    console.error(`Failed to start the Vite dev server: ${error.message}`);
    process.exit(1);
  });

  const up = await waitForServer();
  if (!up) {
    vite.kill("SIGTERM");
    throw new Error(`Vite did not become ready at ${DEV_SERVER_URL}`);
  }
  return vite;
};

try {
  const vite = await ensureDevServer();

  const child = spawn(electronBinary, ["."], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: DEV_SERVER_URL },
  });

  child.on("error", (error) => {
    console.error(`Failed to launch Electron: ${error.message}`);
    vite?.kill("SIGTERM");
    process.exit(1);
  });

  child.on("exit", (code) => {
    // Shut down the Vite process we started (a server that was already
    // running — e.g. started by `dev:desktop` — is left to its owner).
    vite?.kill("SIGTERM");
    process.exit(code ?? 1);
  });
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
}
