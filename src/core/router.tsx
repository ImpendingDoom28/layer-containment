import { BrowserRouter } from "react-router-dom";
import type { ComponentType } from "react";

// Path routes work everywhere: the browser uses the dev server / static host,
// and the packaged desktop app serves the built files from a local loopback
// http origin (see electron/main.ts), so there is no file:// case that would
// require hash routes.
export const AppRouter: ComponentType = BrowserRouter;
