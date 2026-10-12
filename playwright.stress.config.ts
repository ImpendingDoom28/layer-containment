import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the dedicated stress-test entry.
 *
 * Serves `index.stress.html` on a separate port (5174) so it never clashes
 * with the default e2e suite (which uses `npm run dev` on 5173).
 */
const baseURL = "http://localhost:5174";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /stress\.spec\.ts/,
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
    command: "npm run dev:stress",
    url: baseURL,
    reuseExistingServer: true,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  },
});
