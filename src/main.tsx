import React from "react";
import ReactDOM from "react-dom/client";
import { i18n } from "./core/i18n/i18n";
import "./styles/index.css";
import { App } from "./App";
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
rootElement.dataset.testid = "smoke-ready";
ReactDOM.createRoot(rootElement).render(<Game />);
