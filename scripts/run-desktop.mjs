// Builds the unpacked desktop app (if needed) and launches it in a window,
// so the packaged build can be tested without installing it.
//
//   npm run run:desktop            # build if missing, then launch
//   npm run run:desktop -- --rebuild
//
// Exits when the window is closed.
import { spawn, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// require("electron") resolves to the platform executable directly (not the
// .cmd shim that the .bin entry points to), so spawn works on every OS.
const electronBinary = require("electron");

const findUnpacked = () => {
  const releaseDir = path.join(root, "release");
  try {
    return readdirSync(releaseDir)
      .filter((name) => name.endsWith("-unpacked"))
      .map((name) => path.join(releaseDir, name));
  } catch {
    return [];
  }
};

let appDir = findUnpacked()[0];
const wantsRebuild = process.argv.includes("--rebuild");

if (wantsRebuild || !appDir) {
  if (!appDir) console.log("No unpacked app found; building (npm run build:desktop)");
  const result = spawnSync("npm", ["run", "build:desktop"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  appDir = findUnpacked()[0];
}

if (!appDir) {
  console.error("Could not find or build a release/*-unpacked directory.");
  process.exit(1);
}

console.log(`Launching ${appDir}`);
const child = spawn(electronBinary, [appDir], {
  cwd: root,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Failed to launch the desktop app: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
