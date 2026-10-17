import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

// Vite's default port matches the default baseURL; when PLAYWRIGHT_BASE_URL
// points elsewhere, start the dev server on the same port so the webServer
// readiness check (url: baseURL) resolves.
const serverCommand = new URL(baseURL).port
  ? `npm run dev -- --port ${new URL(baseURL).port}`
  : "npm run dev";

export default defineConfig({
  testDir: "./tests/e2e",
  // The stress scene has its own Playwright config (stress/playwright.config.ts)
  // and dev server on port 5174, so it is excluded from the default suite.
  testIgnore: /stress\.spec\.ts$/,
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
    command: serverCommand,
    url: baseURL,
    reuseExistingServer: true,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  },
});
