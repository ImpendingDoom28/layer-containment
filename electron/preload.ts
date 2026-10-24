import { contextBridge, ipcRenderer } from "electron";

// The renderer stays sandboxed (contextIsolation on, nodeIntegration off,
// sandbox on) and gets no Node access. The single bridge below lets uncaught
// renderer errors reach the main process, which logs them and shows a crash
// dialog (see electron/main.ts).
window.addEventListener("error", (event) => {
  ipcRenderer.send("renderer-uncaught-error", {
    message: event.message,
    stack: event.error?.stack ?? "",
  });
});
window.addEventListener("unhandledrejection", (event) => {
  ipcRenderer.send("renderer-uncaught-error", {
    message: `Unhandled promise rejection: ${String(event.reason)}`,
    stack: event.reason instanceof Error ? event.reason.stack ?? "" : "",
  });
});

contextBridge.exposeInMainWorld("desktop", {
  isElectron: true,
});
