// Boots the desktop app the same way the installed binary does (main
// process serves the built app from a loopback http origin) and runs the
// full smoke flow headless, exiting 0/1. This is the reliable way to verify
// the desktop build without installing it.
//
//   npm run build && npm run smoke:desktop [-- --no-sandbox]
//   npm run smoke:desktop -- --unpacked   # smoke the release/*-unpacked app
//
// --no-sandbox is needed on CI runners (no setuid sandbox there).
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// require("electron") resolves to the platform executable directly (not the
// .cmd shim that the .bin entry points to), so spawn works on every OS.
const electronBinary = require("electron");

const args = [electronBinary, ".", "--smoke"];

if (process.argv.includes("--unpacked")) {
  const candidates = readdirSync(path.join(root, "release"))
    .filter((name) => name.endsWith("-unpacked"))
    .map((name) => path.join(root, "release", name));
  if (candidates.length !== 1) {
    console.error(
      `Expected exactly one release/*-unpacked directory, found: ${candidates.length}`
    );
    process.exit(1);
  }
  args[1] = candidates[0];
}

if (process.argv.includes("--no-sandbox")) {
  args.push("--no-sandbox");
}

const child = spawn(args[0], args.slice(1), {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  console.error(`Failed to launch Electron: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
