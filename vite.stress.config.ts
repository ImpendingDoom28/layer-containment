import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Vite config for the dedicated performance stress-test entry.
 *
 * This entry is intentionally separate from the default `vite build`:
 * - `index.html`  -> main game (default build)
 * - `index.stress.html` -> stress-test harness (this build)
 *
 * The stress app (`src/stress-test/`) is only reachable through this entry,
 * so the default build never bundles any stress-test code.
 *
 * Run:
 *   npm run dev:stress     (open http://localhost:5174/index.stress.html)
 *   npm run build:stress   (outputs dist-stress/ with only the stress bundle,
 *                           leaving the default build's dist/ untouched)
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    // Fail fast if 5174 is taken by another (wrong) server instead of
    // falling back to a different port, so e2e never reuses the wrong one.
    strictPort: true,
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
    // Keep the stress build isolated from the default build's dist/ so the
    // two never clobber each other.
    outDir: "dist-stress",
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "index.stress.html"),
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
});
