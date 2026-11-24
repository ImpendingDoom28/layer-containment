import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

// Vite's default port matches the default baseURL; when PLAYWRIGHT_BASE_URL
// points elsewhere, start the dev server on the same port so the webServer
// readiness check (url: baseURL) resolves.
const serverCommand = new URL(baseURL).port
  ? `npm run dev -- --port ${new URL(baseURL).port}`
  : "npm run dev";

const isCi = !!process.env.CI;

// Opt-in software GL (SwiftShader) for headless hosts without a GPU. On such
// hosts the default hardware WebGL context never resolves, so the app stalls
// at "Preparing graphics..." and every canvas-gated test fails. Set
// PLAYWRIGHT_SWIFTSHADER=1 to render in software; it also serializes the
// suite (concurrent SwiftShader compiles stall each other) and raises the
// time budgets, since each WebGL canvas load takes ~20 s in software. Real
// GPU machines and CI leave it unset and keep the fast hardware path.
const useSwiftShader = !isCi && process.env.PLAYWRIGHT_SWIFTSHADER === "1";

const SWIFTSHADER_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

export default defineConfig({
  testDir: "./tests/e2e",
  // The stress scene has its own Playwright config (stress/playwright.config.ts)
  // and dev server on port 5174, so it is excluded from the default suite. The
  // PWA suite (pwa/playwright.config.ts) needs a production build, so it is
  // excluded here as well.
  testIgnore: [/stress\.spec\.ts$/, /pwa\.spec\.ts$/],
  forbidOnly: isCi,
  retries: isCi ? 2 : useSwiftShader ? 1 : 0,
  // Software GL is serialized to avoid cross-worker shader-compile stalls;
  // otherwise the parallelism is the env's (default 50%).
  workers: isCi
    ? 1
    : useSwiftShader
      ? 1
      : (process.env.PLAYWRIGHT_WORKERS ?? "50%"),
  reporter: isCi ? "html" : "list",
  // Software GL makes each WebGL canvas load ~20 s (a test may load two), so
  // the 30 s test / 5 s expect defaults are far too tight.
  ...(useSwiftShader
    ? {
        timeout: 300_000,
        expect: {
          timeout: 60_000,
        },
      }
    : {}),
  use: {
    baseURL,
    trace: "on-first-retry",
    viewport: {
      width: 1280,
      height: 720,
    },
    launchOptions: {
      args: useSwiftShader ? SWIFTSHADER_ARGS : [],
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
