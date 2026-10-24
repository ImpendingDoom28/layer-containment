import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

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
  },
});
