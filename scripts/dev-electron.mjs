// Launches the Electron main process in dev mode. A plain npm script cannot
// set VITE_DEV_SERVER_URL in a cross-platform way ("VAR=x electron ." only
// works in POSIX shells, so it fails on Windows cmd.exe), so the variable is
// set here. `electron .` resolves the app via the "main" field in
// package.json (electron/dist/main.js).
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const electronBinary = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron"
);

const child = spawn(electronBinary, ["."], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: "http://localhost:5173" },
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
