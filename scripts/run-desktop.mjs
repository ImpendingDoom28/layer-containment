// Launches the desktop app the same way the installed binary does (main
// process serves the built app from a loopback http origin).
//
// Modes (general -> specific):
//   npm run run:desktop              # launch the packaged binary in a window
//   npm run run:desktop -- --rebuild # build it first (npm run build:desktop)
//   npm run smoke:desktop            # smoke the repo app (`electron .`)
//   npm run smoke:desktop -- --unpacked
//                                   # smoke the packaged binary
//
// --smoke runs the in-app smoke flow (menu -> level -> tower -> first wave)
// and exits with its status; --boot-only runs only the boot check. A plain
// run targets the packaged executable (building it if missing) so the
// installed build is what gets tested; a plain smoke targets the repo app.
// --no-sandbox disables the Chromium renderer sandbox (no setuid helper on
// headless runners). Additional chromium flags
// (e.g. --disable-gpu, --use-angle=swiftshader for headless software WebGL)
// are forwarded to the app verbatim; see .github/workflows/desktop.yml for
// the per-platform CI choices.
import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// require("electron") resolves to the platform executable directly (not the
// .cmd shim that the .bin entry points to), so spawn works on every OS.
const electronBinary = require("electron");

// Names from package.json. electron-builder derives the packaged executable
// names from these (see the "build" field):
//   Linux:   release/linux-unpacked/<npm name, lowercased>
//   Windows: release/win-unpacked/<build.productName>.exe
//   macOS:   release/mac-<arch>/<build.productName>.app/Contents/MacOS/<...>
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const productName = pkg.build?.productName ?? pkg.name;

const isExecutable = (file) => {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

// Top-level files that are never the app executable (Electron helper binary
// and the usual non-executable resources).
const EXCLUDED_EXE_NAMES = new Set(["chrome_crashpad_handler"]);
const isAppExecutableCandidate = (name) =>
  !EXCLUDED_EXE_NAMES.has(name) &&
  !name.includes(".") && // skips .pak/.bin/.dat/.html/.so and directories
  name !== "resources" &&
  name !== "locales";

// The app's own resources (resources/, locales, .pak, etc.) are never the
// executable; only top-level files in the unpacked dir are candidates.
const findFirstExecutable = (dir) => {
  if (!existsSync(dir)) return null;
  for (const name of readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    if (!isAppExecutableCandidate(name)) continue;
    if (!existsSync(file) || !isExecutable(file)) continue;
    return file;
  }
  return null;
};

// Find the executable of the packaged app for the current platform.
const findPackagedExecutable = () => {
  const names = existsSync(path.join(root, "release"))
    ? readdirSync(path.join(root, "release"))
    : [];
  if (process.platform === "win32") {
    const dir = path.join(root, "release", "win-unpacked");
    for (const name of existsSync(dir) ? readdirSync(dir) : []) {
      if (name.endsWith(".exe")) return path.join(dir, name);
    }
  } else if (process.platform === "darwin") {
    for (const name of names.filter((n) => n.startsWith("mac-"))) {
      const exe = path.join(
        root,
        "release",
        name,
        `${productName}.app`,
        "Contents",
        "MacOS",
        productName
      );
      if (existsSync(exe)) return exe;
    }
  } else {
    const dir = path.join(root, "release", "linux-unpacked");
    const exeName = (pkg.name ?? "").toLowerCase();
    for (const name of existsSync(dir) ? readdirSync(dir) : []) {
      if (name === exeName) return path.join(dir, name);
    }
    // Fall back to the first top-level executable in the unpacked dir (the
    // app exe is the only top-level binary electron-builder produces here).
    return findFirstExecutable(dir);
  }
  return null;
};

// Flags this script itself understands (everything else starting with -- is
// forwarded to the app, e.g. --disable-gpu / --use-angle=swiftshader from CI).
const scriptFlags = new Set([
  "--unpacked",
  "--no-sandbox",
  "--smoke",
  "--boot-only",
  "--rebuild",
]);
const argv = process.argv.slice(2);
const smoke = argv.includes("--smoke");
const bootOnly = argv.includes("--boot-only");
const noSandbox = argv.includes("--no-sandbox");
const env = { ...process.env };
if (noSandbox) env.ELECTRON_DISABLE_SANDBOX = "1";

const forwardArgs = argv.filter((arg) => arg.startsWith("--") && !scriptFlags.has(arg));

// Target executable: a plain run launches the packaged binary (building it
// if missing — that is how the installed build is tested); a plain smoke
// launches `electron .` (the repo app, same main-process code path) unless
// --unpacked asks for the packaged executable.
const usePackaged = argv.includes("--unpacked") || !smoke && !bootOnly;

let executable = electronBinary;
let appPathArgs = ["."];
if (usePackaged) {
  const rebuild = argv.includes("--rebuild");
  let packaged = findPackagedExecutable();
  if (rebuild || !packaged) {
    if (!packaged) console.log("No packaged app found; building (npm run build:desktop)");
    const result = spawnSync("npm", ["run", "build:desktop"], {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
    packaged = findPackagedExecutable();
  }
  if (!packaged) {
    console.error("Could not find or build a packaged app under release/.");
    process.exit(1);
  }
  executable = packaged;
  appPathArgs = [];
}

const exeArgs = smoke || bootOnly ? [bootOnly ? "--smoke-boot" : "--smoke"] : [];
if (noSandbox) exeArgs.push("--no-sandbox");
exeArgs.push(...forwardArgs);

const child = spawn(executable, [...appPathArgs, ...exeArgs], {
  cwd: root,
  stdio: "inherit",
  env,
});

child.on("error", (error) => {
  console.error(`Failed to launch the app: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? (smoke || bootOnly ? 1 : 0));
});
