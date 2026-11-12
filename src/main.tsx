import React from "react";
import ReactDOM from "react-dom/client";
import { i18n } from "./core/i18n/i18n";
import "./styles/index.css";
import { App } from "./App";
import { registerServiceWorker } from "./core/pwa/registerServiceWorker";
import { runUpdateCheck } from "./core/pwa/updateCheck";
import { useUpdateStore } from "./core/pwa/useUpdateStore";
import { AppRouter } from "./core/router";
import { useSettingsStore } from "./core/stores/useSettingsStore";

// AppRouter picks BrowserRouter (http) or HashRouter (file:// for the
// packaged Electron app) based on the protocol — see src/core/router.tsx.
const Game = () => {
  return (
    <React.StrictMode>
      <AppRouter>
        <App />
      </AppRouter>
    </React.StrictMode>
  );
};

// The settings store hydrates synchronously from localStorage; apply the
// saved language to i18n before the first render.
void i18n.changeLanguage(useSettingsStore.getState().language);

// data-testid marks that the app shell mounted (the desktop smoke flow's
// boot step waits for it before interacting with the UI).
const rootElement = document.getElementById("root")!;
rootElement.dataset["testid"] = "smoke-ready";
ReactDOM.createRoot(rootElement).render(<Game />);

// PWA: cache the app shell for offline loads (production builds only).
registerServiceWorker();

// PWA: while the game boots on the last fully-cached version, ask the
// service worker whether a newer deploy exists and let it precache it in the
// background (hard 30s budget, enforced in the SW). "update-ready" reloads
// the page into the new version (GamePage, once back in the main menu);
// "update-failed" shows a dismissible banner and retries on the next launch.
// No service worker (dev build, non-secure origin) → no-op.
const { setUpdateStatus } = useUpdateStore.getState();
setUpdateStatus("checking");
void runUpdateCheck(import.meta.env, (result) => {
  if (result.status === "up-to-date") setUpdateStatus("idle");
  else if (result.status === "update-ready") setUpdateStatus("ready");
  else setUpdateStatus("failed");
});
