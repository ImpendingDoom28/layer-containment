// Boots the desktop app the same way the installed binary does (main
// process serves the built app from a loopback http origin) and runs the
// full smoke flow headless, exiting 0/1. This is the reliable way to verify
// the desktop build without installing it.
//
//   npm run build && npm run smoke:desktop [-- --no-sandbox]
//   npm run smoke:desktop -- --unpacked   # launch the packaged executable
//
// Without --unpacked it launches `electron .` (the unpackaged app in the
// repo, same main-process code path). With --unpacked it locates and
// launches the executable electron-builder produced (release/
// linux-unpacked|win-unpacked|mac-<arch>), i.e. the actual installed binary.
//
// --no-sandbox disables the Chromium renderer sandbox (no setuid helper on
// headless runners). Safe to pass anywhere.
//
// Additional chromium flags (e.g. --disable-gpu, --use-angle=swiftshader for
// headless software WebGL) are forwarded to the app verbatim; see the CI
// matrix in .github/workflows/desktop.yml for the per-platform choices.
import { spawn } from "node:child_process";
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
const scriptFlags = new Set(["--unpacked", "--no-sandbox", "--smoke", "--boot-only"]);
const noSandbox = process.argv.includes("--no-sandbox");
const bootOnly = process.argv.includes("--boot-only");
const env = { ...process.env };
if (noSandbox) env.ELECTRON_DISABLE_SANDBOX = "1";

const forwardArgs = process.argv
  .slice(2)
  .filter((arg) => arg.startsWith("--") && !scriptFlags.has(arg));

const exeArgs = [bootOnly ? "--smoke-boot" : "--smoke"];
if (noSandbox) exeArgs.push("--no-sandbox");
exeArgs.push(...forwardArgs);

let executable = electronBinary;
let appPathArgs = ["."];
if (process.argv.includes("--unpacked")) {
  const packaged = findPackagedExecutable();
  if (!packaged) {
    console.error(
      "No packaged app found under release/. Run `npx electron-builder --dir --<target>` first."
    );
    process.exit(1);
  }
  executable = packaged;
  appPathArgs = [];
}

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
  process.exit(code ?? 1);
});
