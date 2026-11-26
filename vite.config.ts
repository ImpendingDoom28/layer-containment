import path from "path";
import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const nodeRequire = createRequire(import.meta.url);

// https://vitejs.dev/config/
export default defineConfig({
  // Relative base so the built app works from file:// (Electron) and from
  // any sub-path; the dev server ignores it for its own URLs.
  base: "./",
  plugins: [react(), tailwindcss()],
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
