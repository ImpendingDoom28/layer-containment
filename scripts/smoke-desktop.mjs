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
// Headless-CI flags (both are no-ops on a machine with a real GPU + sandbox):
//   --no-sandbox    disable the Chromium renderer sandbox (no setuid helper
//                   on runners). Safe to pass anywhere.
//   --disable-gpu   force software rendering. Only needed on GPU-less runners;
//                   do NOT pass it on a real GPU machine — it disables WebGL
//                   there and the game cannot boot.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// require("electron") resolves to the platform executable directly (not the
// .cmd shim that the .bin entry points to), so spawn works on every OS.
const electronBinary = require("electron");

// Find the executable of the packaged app. electron-builder output layouts:
//   Linux:   release/linux-unpacked/<lowercased-product-name>
//   Windows: release/win-unpacked/<Product Name>.exe
//   macOS:   release/mac-<arch>/<Product Name>.app/Contents/MacOS/<Product Name>
const findPackagedExecutable = () => {
  const names = existsSync(path.join(root, "release"))
    ? readdirSync(path.join(root, "release"))
    : [];
  if (process.platform === "win32") {
    const dir = path.join(root, "release", "win-unpacked");
    for (const name of names.length ? readdirSync(dir) : []) {
      if (name.endsWith(".exe")) return path.join(dir, name);
    }
  } else if (process.platform === "darwin") {
    for (const name of names.filter((n) => n.startsWith("mac-"))) {
      const exe = path.join(
        root,
        "release",
        name,
        "Layer Containment.app",
        "Contents",
        "MacOS",
        "Layer Containment"
      );
      if (existsSync(exe)) return exe;
    }
  } else {
    const dir = path.join(root, "release", "linux-unpacked");
    for (const name of names.length ? readdirSync(dir) : []) {
      if (name.startsWith("layer-containment")) return path.join(dir, name);
    }
  }
  return null;
};

const noSandbox = process.argv.includes("--no-sandbox");
const noGpu = process.argv.includes("--disable-gpu");
const env = { ...process.env };
if (noSandbox) env.ELECTRON_DISABLE_SANDBOX = "1";

const exeArgs = ["--smoke"];
if (noSandbox) exeArgs.push("--no-sandbox");
if (noGpu) exeArgs.push("--disable-gpu");

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
