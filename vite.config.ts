import path from "path";
import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * The stress-test entry (`stress/index.stress.html`) is a separate build,
 * served by `dev:stress` / `build:stress` (see `stress/vite.config.ts`). The
 * default dev server (this config) serves every file under the repo root, so
 * it would otherwise expose that dedicated entry at `/stress/index.stress.html`
 * — running the stress test from a bare `npm run dev`. Block it here so the
 * only in-app path to the stress scene is the main app's `/stress` route, which
 * the `?m=debug` flag hides behind the main-menu button.
 */
const blockStressEntry: Plugin = {
  name: "block-stress-entry",
  // Returning the registration (instead of calling it) makes Vite install the
  // middleware *before* its internal ones, so the block runs ahead of the SPA
  // fallback that would otherwise serve `index.html` for the unknown path.
  configureServer(server) {
    return () => {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (
          url.includes("index.stress.html") ||
          url.startsWith("/stress/app/")
        ) {
          res.statusCode = 404;
          res.end(
            "The stress entry is not served by the default dev server; use `npm run dev:stress`."
          );
          return;
        }
        next();
      });
    };
  },
};

const nodeRequire = createRequire(import.meta.url);

// https://vitejs.dev/config/
export default defineConfig({
  // Relative base so the built app works from file:// (Electron) and from
  // any sub-path; the dev server ignores it for its own URLs.
  base: "./",
  plugins: [react(), tailwindcss(), blockStressEntry],
  server: {
    port: 5173,
    strictPort: false, // For workspaces so we can run in app in different worktrees
    watch: {
      ignored: ["**/*.md"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@/ui": path.resolve(import.meta.dirname, "./src/components/ui"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          console.log(id);
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // `three` is a dual package: under vitest the CJS R3F/test-renderer
    // modules load `three.cjs` while tests and components load
    // `three.module.js` — two module instances, i.e. two `Vector3` classes.
    // R3F's `applyProps` identifies math objects by
    // `target.constructor === value.constructor`, so a component that passes
    // a Vector3/Quaternion (like `Tile`'s sphere pose) would skip the copy
    // branch and hit a plain assignment, which three ≥ 0.183 rejects
    // (`Object3D` transform props are read-only). Pin `three` to the CJS
    // build so every import in the test graph resolves to one instance.
    // Test-only: the dev server and build are unaffected. A RegExp find so
    // only the bare specifier is aliased — `three/addons` and the like keep
    // their normal subpath resolution.
    alias: [
      {
        find: /^three$/,
        replacement: nodeRequire.resolve("three"),
      },
    ],
  },
});
