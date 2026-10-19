import { existsSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, Menu } from "electron";

const DEV_SERVER_URL =
  process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";

// `--smoke` boots the packaged code path (loadFile over file://) even when
// unpackaged, prints boot diagnostics, and exits with 0/1. Dev-only; it is
// the reliable way to verify the desktop boot (file:// + asset loading)
// without a full install. Run: `npm run build && tsc -p electron/tsconfig.json
// && npx electron . --smoke --no-sandbox`
const isSmoke = process.argv.includes("--smoke");

// Dev loads the Vite dev server over http. Packaged (or smoke) loads the
// built app from dist/ over file://, so routing must stay hash-based
// (see src/core/router.tsx) and asset loading must survive file:// CORS.
const useDevServer = !app.isPackaged && !isSmoke;

let mainWindow: BrowserWindow | null = null;

const resolveIndexHtml = () =>
  path.join(app.getAppPath(), "dist", "index.html");

const createMainWindow = () => {
  // The renderer loads only local, trusted content (the game's own dist/).
  // It is fully sandboxed: no Node integration, contextIsolation on, no IPC.
  // webSecurity is relaxed only for the file:// (packaged) case because the
  // game fetches its config and audio as static files, and Chromium blocks
  // file:// → file:// requests under the default web security. If the app
  // ever loads remote/untrusted content, serve it over a local HTTP server
  // or a registered protocol instead of relying on this.
  const window = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: "#0a0a0f",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: useDevServer,
    },
  });

  Menu.setApplicationMenu(null);
  window.setMenuBarVisibility(false);

  window.webContents.on("before-input-event", (event, input) => {
    // Keep the app keyboard-first (camera movement, pause, tower hotkeys).
    if (
      input.type === "keyDown" &&
      input.key === "F12" &&
      !input.control &&
      !input.alt
    ) {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  if (useDevServer) {
    void window.loadURL(DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(resolveIndexHtml());
  }

  window.on("closed", () => {
    mainWindow = null;
  });

  return window;
};

const runSmoke = (window: BrowserWindow) => {
  const dumpState = (label: string) =>
    window.webContents
      .executeJavaScript(
        `JSON.stringify({ readyState: document.readyState, url: location.href, rootLen: document.getElementById("root")?.innerHTML.length ?? -1 })`
      )
      .then((state) => console.log(`${label}:`, state))
      .catch((error) => console.log(`${label} (eval error):`, String(error)));

  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3) console.log("RENDERER ERROR:", message);
  });
  window.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.log("DID-FAIL-LOAD:", code, desc, url);
  });

  // Inner polling is ~10s (20 × 500ms); the outer timeout is 30s so the
  // evaluator always reports first. If it times out we dump renderer state.
  const timeout = setTimeout(() => {
    void dumpState("SMOKE TIMEOUT STATE");
    console.log("SMOKE FAILED (timeout)");
    app.exit(1);
  }, 30_000);

  window.webContents
    .executeJavaScript(
      `new Promise((resolve) => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const check = async () => {
          for (let i = 0; i < 20; i++) {
            const play = [...document.querySelectorAll("button")]
              .find((b) => b.textContent.trim() === "Play");
            if (play) return { ok: true, url: location.href, rootLen: document.getElementById("root")?.innerHTML.length ?? -1 };
            await wait(500);
          }
          return { ok: false, url: location.href, rootLen: document.getElementById("root")?.innerHTML.length ?? -1 };
        };
        resolve(check());
      })`
    )
    .then((result) => {
      clearTimeout(timeout);
      console.log("SMOKE RESULT:", JSON.stringify(result));
      app.exit(result && result.ok ? 0 : 1);
    })
    .catch((error) => {
      clearTimeout(timeout);
      console.log("SMOKE FAILED (eval):", String(error));
      app.exit(1);
    });
};

const onAppReady = () => {
  if (!useDevServer && !existsSync(resolveIndexHtml())) {
    // Launched without the web build (e.g. a dev shortcut) — fail loudly
    // rather than showing a blank window.
    app.exit(1);
  }

  mainWindow = createMainWindow();

  if (isSmoke && mainWindow) {
    runSmoke(mainWindow);
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
};

app.whenReady().then(onAppReady);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
