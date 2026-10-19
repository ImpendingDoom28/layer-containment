// Intentionally empty: the game runs entirely on web APIs (WebGL, Web Audio,
// localStorage, and — in the packaged file:// case — fetch of local static
// files with webSecurity relaxed, see electron/main.ts). Keep the renderer
// sandboxed (contextIsolation on, nodeIntegration off, sandbox on) and add
// IPC here only if a feature genuinely needs Node access (tray, native
// dialogs, ...).
