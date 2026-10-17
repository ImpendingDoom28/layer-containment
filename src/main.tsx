import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { i18n } from "./core/i18n/i18n";
import "./styles/index.css";
import { App } from "./App";
import { useSettingsStore } from "./core/stores/useSettingsStore";

const Game = () => {
  return (
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
};

// The settings store hydrates synchronously from localStorage; apply the
// saved language to i18n before the first render.
void i18n.changeLanguage(useSettingsStore.getState().language);

ReactDOM.createRoot(document.getElementById("root")!).render(<Game />);
