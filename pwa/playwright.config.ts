import path from "path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the PWA e2e suite.
 *
 * The service worker only registers in a production build on a secure
 * origin, so this suite runs against `vite preview` (the built output)
 * instead of the dev server that the default suite uses. It builds first
 * and serves `dist/` on port 5198 so it never clashes with the dev server
 * (5173) or the stress scene (5174).
 */
const baseURL = "http://localhost:5198";
const repoRoot = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  testDir: path.join(repoRoot, "tests", "e2e"),
  testMatch: /pwa\.spec\.ts$/,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : "50%",
  reporter: process.env.CI ? "html" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    viewport: {
      width: 1280,
      height: 720,
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: {
          width: 1280,
          height: 720,
        },
      },
    },
  ],
  webServer: {
    // Build is idempotent and fast (~1s); preview then serves dist/ on 5198.
    command: "npm run build && npm run preview -- --port 5198 --strictPort",
    cwd: repoRoot,
    url: baseURL,
    // A preview already on 5198 would serve a stale build; fail instead.
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 180_000,
  },
});
