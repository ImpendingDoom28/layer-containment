import path from "path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the PWA e2e suite.
 *
 * The service worker only registers in a production build on a secure
 * origin, so this suite runs against `vite preview` (the built output)
 * instead of the dev server that the default suite uses. Locally it builds
 * first; on CI the `build` job already produced `dist/` (downloaded as an
 * artifact), so only `preview` runs. Port 5198 keeps it clear of the dev
 * server (5173) and the stress scene (5174).
 */
const baseURL = "http://localhost:5198";
const repoRoot = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  testDir: path.join(repoRoot, "tests", "e2e"),
  testMatch: /pwa\.spec\.ts$/,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
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
    // Locally the build is idempotent and fast (~1s); on CI the `build`
    // job's `dist/` artifact is already in place, so previewing alone
    // avoids a second full build.
    command: process.env.CI
      ? "npm run preview -- --port 5198 --strictPort"
      : "npm run build && npm run preview -- --port 5198 --strictPort",
    cwd: repoRoot,
    url: baseURL,
    // A preview already on 5198 would serve a stale build; fail instead.
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 180_000,
  },
});
