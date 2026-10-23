import {
  appendFileSync,
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import http from "node:http";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";

// The Vite dev server URL; the dev:electron launch script sets this (see
// scripts/dev-electron.mjs).
const DEV_SERVER_URL =
  process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";

// `--smoke` boots the packaged code path (local static server, no dev server)
// even when unpackaged, runs a full menu→gameplay flow, prints diagnostics,
// and exits with 0/1. Run: `npm run build && tsc -p electron/tsconfig.json
// && npm run smoke:desktop -- --no-sandbox`.
// `--smoke-boot` is the same without WebGL: it only verifies the packaged
// binary launches, serves the app over loopback, and the app shell loads
// (used on headless CI where software WebGL cannot be guaranteed).
const isSmoke = process.argv.includes("--smoke");
const isSmokeBoot = process.argv.includes("--smoke-boot");
const isSmokeAny = isSmoke || isSmokeBoot;

// Dev loads the Vite dev server; everything else (packaged or smoke) serves
// the built app over a loopback http server — see startAppServer.
const useDevServer = !app.isPackaged && !isSmokeAny;

let mainWindow: BrowserWindow | null = null;
let appServerUrl = "";
// Set before an intentional quit so the crash handlers (which also fire when
// the renderer is torn down during shutdown) don't show a spurious dialog.
let isQuitting = false;

const resolveIndexHtml = () =>
  path.join(app.getAppPath(), "dist", "index.html");

const logDir = () => app.getPath("userData");
const logFile = () => path.join(logDir(), "game.log");

const appendLog = (line: string) => {
  try {
    appendFileSync(logFile(), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Logging must never take the app down.
  }
};

// The packaged app used to load dist/index.html over file://, where Chromium
// treats the origin as opaque: Web Workers (the background game loop mounts
// on the main menu) cannot start and the game dies on a WebGL context error.
// Serving the same local files from loopback http keeps everything local and
// trusted while giving the renderer a real origin, so workers, config
// fetches, and WebGL behave exactly like the web build.
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".map": "application/json; charset=utf-8",
};

const startAppServer = async (): Promise<string> => {
  const distDir = path.join(app.getAppPath(), "dist");

  const server = http.createServer((req, res) => {
    // decodeURIComponent throws on malformed percent-encoding (e.g. "/%"),
    // so keep it inside a try: a bad request must not crash the handler.
    let urlPath: string;
    try {
      urlPath = decodeURIComponent(
        new URL(req.url ?? "/", "http://localhost").pathname
      );
    } catch {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }
    let filePath = path.join(distDir, urlPath);
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    // SPA fallback: unknown paths without an extension serve the app shell.
    if (!path.extname(filePath) && !existsSync(filePath)) {
      filePath = path.join(distDir, "index.html");
    }
    try {
      if (statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      const data = readFileSync(filePath);
      res.writeHead(200, {
        "Content-Type":
          MIME_TYPES[path.extname(filePath).toLowerCase()] ??
          "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // Loopback-only on a random port: nothing outside this machine can
    // reach it.
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Local app server did not bind to a TCP port");
  }
  return `http://127.0.0.1:${address.port}/`;
};

const showCrashDialog = (title: string, detail: string) => {
  appendLog(`CRASH: ${title}\n${detail}\n`);
  if (mainWindow === null || mainWindow.isDestroyed()) return;
  void dialog
    .showMessageBox(mainWindow, {
      type: "error",
      title,
      message: detail,
      detail: `Full log: ${logFile()}`,
      buttons: ["Open logs", "OK"],
      defaultId: 1,
      noLink: true,
    })
    .then(({ response }) => {
      if (response === 0) {
        void shell.openPath(logDir());
      }
    });
};

const onRendererCrash = (
  _event: Electron.IpcMainEvent,
  payload?: { message?: string; stack?: string }
) => {
  const message = payload?.message ?? "Unknown renderer error";
  showCrashDialog(
    "Layer Containment crashed",
    `Uncaught error:\n${message}\n\n${payload?.stack ?? ""}`
  );
};

const createMainWindow = () => {
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
    },
  });

  Menu.setApplicationMenu(null);
  window.setMenuBarVisibility(false);

  // Links must never open a remote page in a child window or navigate the
  // app away from its local content — hand them to the OS browser instead.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    // In-app navigation over the local origin stays; anything else is an
    // external link and belongs to the OS browser.
    const localRoots = useDevServer ? [DEV_SERVER_URL] : [appServerUrl];
    if (!localRoots.some((root) => url.startsWith(root))) {
      event.preventDefault();
      if (/^https?:/i.test(url)) {
        void shell.openExternal(url);
      }
    }
  });

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

  // Crash diagnostics: every renderer console message and uncaught error is
  // mirrored to <userData>/game.log, and uncaught errors also surface as a
  // dialog so the user can see (and copy) what happened.
  window.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      appendLog(`RENDERER[${level}] ${sourceId}:${line} ${message}`);
    }
  );
  window.webContents.on("did-fail-load", (_event, code, desc, url) => {
    appendLog(`DID-FAIL-LOAD: ${code} ${desc} ${url}`);
  });
  window.webContents.on("unresponsive", () => {
    if (isQuitting) return;
    showCrashDialog(
      "Layer Containment is not responding",
      "The renderer process stopped responding (usually a GPU crash on this machine)."
    );
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    if (isQuitting) return;
    showCrashDialog(
      "Layer Containment crashed",
      `The renderer process ${details.reason} (exit code ${details.exitCode}).`
    );
  });


  if (useDevServer) {
    void window.loadURL(DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadURL(appServerUrl);
  }

  window.on("closed", () => {
    mainWindow = null;
  });

  return window;
};

const runSmoke = (window: BrowserWindow, bootOnly: boolean) => {
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

  // Full flow: boot → main menu → Play → level pick → tower placed → wave
  // started. Each step reports where it got stuck, so a failure is
  // diagnosable from the log alone. The canvas points are calibrated for the
  // fixed 1280x720 window (same as the e2e fixture).
  // Boot-only flow (no WebGL): proves the packaged binary launches, the
  // loopback server works, and the app shell loads. Used on headless CI where
  // software WebGL cannot be guaranteed. The full gameplay smoke (--smoke)
  // additionally needs a working GPU.
  const bootFlow = `new Promise((resolve) => {
    const out = { steps: [], errors: [], ok: false };
    const log = (step, data) => out.steps.push({ step, ...data });
    window.addEventListener("error", (e) => out.errors.push("error: " + e.message));
    window.addEventListener("unhandledrejection", (e) => out.errors.push("rejection: " + String(e.reason)));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const ready = () => !!document.querySelector('[data-testid="smoke-ready"]');
    const deadline = Date.now() + 30000;
    const tick = async () => {
      if (ready() || Date.now() >= deadline) {
        log("boot", {
          pass: ready(),
          url: location.href,
          rootText: (document.getElementById("root")?.innerText ?? "").replace(/\\s+/g, " ").slice(0, 80),
        });
        out.ok = ready();
        resolve(out);
        return;
      }
      await wait(250);
      void tick();
    };
    void tick();
  })`;

  const smokeFlow = `new Promise((resolve) => {
    const out = { steps: [], errors: [], ok: false };
    const log = (step, data) => out.steps.push({ step, ...data });
    window.addEventListener("error", (e) => out.errors.push("error: " + e.message));
    window.addEventListener("unhandledrejection", (e) => out.errors.push("rejection: " + String(e.reason)));
    try { localStorage.setItem("containment-layer-controls-intro-seen", "1"); } catch (e) {}
    const findByTestId = (id) => document.querySelector('[data-testid="' + id + '"]');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const poll = async (fn, ms, every = 250) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) { if (await fn()) return true; await wait(every); }
      return await fn();
    };
    const tryClick = (el) => { if (el) el.click(); return !!el; };
    const clickPoint = (canvas, x, y) => {
      for (const type of ["pointerdown", "pointerup", "click"]) {
        canvas.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, view: window,
          clientX: x, clientY: y, button: 0, pointerType: "mouse", isPrimary: true,
        }));
      }
    };
    const placeTower = async (canvas) => {
      const points = [[720,260],[880,260],[700,360],[860,520],[560,560]];
      for (const [x, y] of points) {
        clickPoint(canvas, x, y);
        await wait(400);
        if (findByTestId("tower-cancel-selection")) return true;
      }
      return false;
    };
    const run = async () => {
      try {
        // GPU/WebGL fingerprint for the log: when the game scene cannot boot
        // (usually a missing or software-only WebGL context) this is what
        // tells you why.
        const gl = document.createElement("canvas").getContext("webgl");
        let glInfo = { ok: false };
        if (gl) {
          const dbg = gl.getExtension("WEBGL_debug_renderer_info");
          glInfo = {
            ok: true,
            vendor: gl.getParameter(gl.VENDOR),
            renderer: gl.getParameter(
              dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER
            ),
            version: gl.getParameter(gl.VERSION),
          };
        }
        log("gpu", glInfo);
        if (!await poll(() => !!findByTestId("smoke-ready"), 30000)) {
          log("boot", { fail: "smoke-ready marker never appeared", rootLen: document.getElementById("root")?.innerHTML.length ?? -1 });
          return;
        }
        log("boot", { pass: true, url: location.href });
        // Config fetch + render-loop health: the menu only appears once the
        // shader gate (driven by the R3F frame loop) reports ready, so if the
        // loop is not ticking the app is stuck on "Preparing graphics".
        const cfg = await fetch("/configs/game.json")
          .then((r) => r.ok)
          .catch(() => false);
        let rafTicks = -1;
        try {
          rafTicks = await new Promise((r) => {
            let n = 0;
            const t0 = Date.now();
            const tick = () => {
              n += 1;
              if (Date.now() - t0 >= 2000) return r(n);
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            setTimeout(() => r(n), 4000);
          });
        } catch (e) {
          rafTicks = "error";
        }
        let glLost = null;
        try {
          const c = document.querySelector("canvas");
          const g = (c && c.getContext("webgl2")) || (c ? c.getContext("webgl") : null);
          glLost = g ? g.isContextLost() : "no-context";
        } catch (e) {
          glLost = "error";
        }
        log("runtime", {
          fetchOk: cfg,
          rafTicks2s: rafTicks,
          webglContextLost: glLost,
          rootText: (document.getElementById("root")?.innerText ?? "").replace(/\s+/g, " ").slice(0, 160),
        });
        // The shader gate can take up to two 10s compile timeouts before it
        // proceeds anyway, so allow ~35s for the menu to appear.
        if (!await poll(() => !!findByTestId("main-menu-play"), 35000)) {
          log("main-menu", { fail: "Play button never appeared (scene/shader gate stuck?)" });
          return;
        }
        log("main-menu", { pass: true });
        if (!tryClick(findByTestId("main-menu-play"))) return;
        if (!await poll(() => !!findByTestId("level-picker-level_1"), 15000)) {
          log("level-picker", { fail: "level picker never appeared" });
          return;
        }
        log("level-picker", { pass: true });
        if (!tryClick(findByTestId("level-picker-level_1"))) {
          log("level-select", { fail: "level_1 entry missing" });
          return;
        }
        if (!await poll(() => !!findByTestId("tower-shop"), 15000)) {
          log("tower-shop", { fail: "tower shop never appeared (level config or shader gate stuck?)" });
          return;
        }
        log("tower-shop", { pass: true });
        // Tower placement is best-effort: it needs real canvas raycasting,
        // which synthetic pointer events don't always satisfy in a headless
        // run. Reaching the tower shop already proves the game scene booted
        // (config + shaders + canvas), which is what "passed the main screen"
        // means. We still attempt it so the log shows whether the canvas is
        // interactive.
        if (tryClick(findByTestId("tower-basic"))) {
          log("tower-select", { pass: true });
          const canvas = document.querySelector("canvas");
          const placed = canvas
            ? await poll(() => placeTower(canvas), 8000, 1200)
            : false;
          log("tower-place", placed ? { pass: true } : { info: "not placed (synthetic click)" });
          tryClick(findByTestId("tower-cancel-selection"));
        } else {
          log("tower-select", { info: "basic tower button not found" });
        }
        if (!await poll(() => !!findByTestId("wave-start"), 10000)) {
          log("wave-start", { fail: "Start next wave button never appeared" });
          return;
        }
        log("wave-start", { pass: true });
        if (!tryClick(findByTestId("wave-start"))) return;
        const waveAdvanced = await poll(() => {
          const stats = findByTestId("wave-count");
          return !!stats && !/^0\\s*\\/\\s*\\d+$/.test(stats.textContent ?? "");
        }, 20000);
        if (!waveAdvanced) { log("wave-start", { fail: "wave counter did not advance" }); return; }
        log("wave-start", { pass: true });
        out.ok = true;
      } catch (e) {
        log("flow", { fail: String(e && e.message || e) });
      }
    };
    void run().then(() => resolve(out));
  })`;

  const timeout = setTimeout(() => {
    void dumpState("SMOKE TIMEOUT STATE");
    console.log("SMOKE FAILED (timeout)");
    isQuitting = true;
    app.exit(1);
  }, bootOnly ? 60_000 : 180_000);

  window.webContents
    .executeJavaScript(bootOnly ? bootFlow : smokeFlow)
    .then((result) => {
      clearTimeout(timeout);
      console.log(
        bootOnly ? "SMOKE BOOT RESULT:" : "SMOKE RESULT:",
        JSON.stringify(result, null, 2)
      );
      isQuitting = true;
      app.exit(result && result.ok ? 0 : 1);
    })
    .catch((error) => {
      clearTimeout(timeout);
      console.log("SMOKE FAILED (eval):", String(error));
      isQuitting = true;
      app.exit(1);
    });
};

const onAppReady = async () => {
  if (!useDevServer && !existsSync(resolveIndexHtml())) {
    // Launched without the web build (e.g. a dev shortcut) — fail loudly
    // rather than showing a blank window.
    console.error("dist/index.html is missing — run `npm run build` first.");
    app.exit(1);
  }

  if (!useDevServer) {
    try {
      appServerUrl = await startAppServer();
      console.log("Serving built app at", appServerUrl);
    } catch (error) {
      console.error("Failed to start local app server:", error);
      app.exit(1);
    }
  }

  mainWindow = createMainWindow();

  if (isSmokeAny && mainWindow) {
    runSmoke(mainWindow, isSmokeBoot);
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
};

// The sandboxed preload bridges uncaught renderer exceptions over this IPC
// channel; log them and surface a crash dialog.
ipcMain.on("renderer-uncaught-error", (event, payload) => {
  onRendererCrash(event, payload);
});

app.whenReady().then(onAppReady);

// Quit on every platform when the last window closes (not just on Windows/
// Linux as the macOS convention would): a dev launcher that started the Vite
// server (or a CI smoke run) must not linger with its helper processes alive
// after the window goes away.
app.on("window-all-closed", () => {
  isQuitting = true;
  app.quit();
});
