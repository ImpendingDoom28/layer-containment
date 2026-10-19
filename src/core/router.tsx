import { BrowserRouter, HashRouter } from "react-router-dom";
import type { ComponentType } from "react";

// The app is served by a dev server or a static host (BrowserRouter, path
// routes) in the browser, but the packaged Electron app loads the built
// files from file:// where there is no server to resolve path routes.
// Picking the router by protocol keeps clean URLs in the browser and working
// routes in the desktop shell without touching the rest of the app.
const isFileProtocol =
  typeof window !== "undefined" && window.location.protocol === "file:";

export const AppRouter: ComponentType = isFileProtocol
  ? HashRouter
  : BrowserRouter;
