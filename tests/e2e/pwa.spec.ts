import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

import { CONTROLS_INTRO_SEEN_KEY } from "./fixtures/navigation";

// PWA: manifest + icon links in the shell, and service worker registration
// in a production build. This suite runs against `vite preview` (see
// pwa/playwright.config.ts), where the SW registration guard (production +
// secure origin) holds; the default dev-server suite excludes it.
test.describe("PWA", () => {
  test("index.html links the manifest and PWA icons", async ({ request }) => {
    const html = await request.get("/");
    const text = await html.text();

    expect(html.ok()).toBe(true);
    expect(text).toContain('rel="manifest"');
    expect(text).toContain("/manifest.webmanifest");
    expect(text).toContain('rel="apple-touch-icon"');
    expect(text).toContain("/pwa/pwa-icon-192.png");
    expect(text).toContain('name="theme-color"');
  });

  test("index.html enables the full-bleed PWA viewport", async ({
    request,
  }) => {
    const html = await request.get("/");
    const text = await html.text();

    // Full-bleed standalone PWA: the viewport extends into the safe areas
    // (viewport-fit=cover) instead of reserving a black status-bar band,
    // which is what left a huge black bar at the top and clipped the bottom
    // of the HUD on iOS landscape.
    expect(text).toContain("viewport-fit=cover");
    // black-translucent lets the content draw underneath the status bar.
    expect(text).toContain('name="apple-mobile-web-app-status-bar-style"');
    expect(text).toContain('content="black-translucent"');
  });

  test("manifest lists app identity and icons", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);

    const manifest = (await response.json()) as {
      name: string;
      short_name: string;
      start_url: string;
      display: string;
      theme_color: string;
      background_color: string;
      icons: { src: string; sizes: string; purpose: string }[];
    };

    expect(manifest.name).toBe("Layer Containment");
    expect(manifest.short_name).toBe("Layer Containment");
    expect(manifest.start_url).toBe("./");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#0A0A0F");
    expect(manifest.background_color).toBe("#0A0A0F");
    expect(manifest.icons.some((icon) => icon.purpose === "any")).toBe(true);
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(
      true
    );
  });

  test("manifest icons are served with the right types", async ({
    request,
  }) => {
    for (const src of [
      "/pwa/pwa-icon-192.png",
      "/pwa/pwa-icon-512.png",
      "/pwa/pwa-icon-maskable-192.png",
      "/pwa/pwa-icon-maskable-512.png",
    ]) {
      const response = await request.get(src);
      expect(response.ok(), `${src} should be served`).toBe(true);
      expect(response.headers()["content-type"]).toContain("image/png");
    }
  });

  test("service worker registers in a production build", async ({
    context,
    page,
  }) => {
    const pagePromise = page.goto("/");
    const worker = await context.waitForEvent("serviceworker");
    await pagePromise;
    expect(worker.url()).toContain("sw.js");
  });
});

// ---------------------------------------------------------------------------
// Versioned offline cache + background update flow (public/sw.js, exercised
// end-to-end).
//
// Each test gets a fresh browser context, so the caches start empty. The
// first boot installs the service worker and precaches the deployed version
// (v1). "Simulating a deploy" swaps the live index.html (what the SW's fresh
// fetches see) for a modified one through context.route: it gains a new
// <script> asset URL, so the deploy's version (a hash of the URL set) differs
// from the installed one — a title marker alone would not change the hash.
// The app pings the SW on every boot (runUpdateCheck), which is what drives
// the update; the tests navigate again after the "deploy" so that boot's ping
// sees the new version. The SW replies on the ServiceWorkerContainer (the
// app listens there), and the tests assert on the resulting UI: the cached
// shell that booted, the failure/ready banners, and the auto-reload.
// ---------------------------------------------------------------------------

type DeployedVersion = "v1" | "v2";

// The asset a v2 deploy adds to index.html. Its presence (a new URL in the
// deploy) is what changes the version hash; the file itself is a no-op.
const MARKER_SCRIPT = "/pwa-marker-v2.js";

// Marks the deployed index.html with the version, so a test can tell which
// shell a page booted from. The marker rides in the cached shell's <head>
// (the app only overwrites the title's text, not its attributes), and the
// added <script> URL is what actually changes the version hash.
const indexWithVersion = (version: DeployedVersion, html: string) =>
  html
    .replace(
      /<title[^>]*>[\s\S]*?<\/title>/,
      `<title data-pwa-version="${version}">LAYER CONTAINMENT</title>`
    )
    .replace("</head>", `<script src="${MARKER_SCRIPT}"></script>\n</head>`);

// Boots the app on the current deploy and waits for the menu, which also
// registers, installs and activates the service worker.
const bootMenu = async (page: Page) => {
  await page.goto("/");
  // Wait until the service worker has installed and activated. (Playwright's
  // ServiceWorker object exposes no state, so this polls the registration
  // itself; the update flow requires the worker to be active.)
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.active?.state === "activated";
    },
    undefined,
    { timeout: 30_000 }
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The menu renders through the WebGL scene; the Play button is the
  // app-ready marker (same as the other suites).
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible({
    timeout: 30_000,
  });
};

// Simulates a new deploy: the live index.html (what the SW's fresh fetches
// see) gains the v2 marker + the marker-script URL, so its version differs
// from the installed one. `slowFreshIndexMs` delays the SW's fresh index
// fetch (used to push the update past its 30s budget, or to time it behind a
// run entry); only the fresh index fetch is delayed — cached navigations and
// the precached assets are unaffected.
const deployV2 = async (
  context: BrowserContext,
  { slowFreshIndexMs = 0 }: { slowFreshIndexMs?: number } = {}
) => {
  const base = await context.request.get("/");
  const v2Html = indexWithVersion("v2", await base.text());
  await context.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isFresh = url.searchParams.get("src") === "fresh";
    const isIndex =
      url.pathname === "/" || url.pathname.endsWith("/index.html");
    // The SW's fresh index fetch (computeVersion / precacheVersion): serve
    // the v2 deploy, optionally slowly. A delay beyond the SW's 30s budget
    // makes the update's AbortController fire (update-failed).
    if (request.method() === "GET" && isFresh && isIndex) {
      if (slowFreshIndexMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, slowFreshIndexMs));
      }
      try {
        return await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: v2Html,
        });
      } catch {
        // The request was aborted by the SW's timeout before the (delayed)
        // fulfill landed; the SW has already reported the failure.
      }
      return;
    }
    // The new asset the v2 shell references (the SW precaches it fresh).
    if (url.pathname === MARKER_SCRIPT) {
      return route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "/* pwa marker v2 */",
      });
    }
    await route.continue();
  });
};

// The version marker of the shell the page booted from (null on the original
// v1 shell, which has no marker; "v2" on the deployed shell).
const bootedVersion = async (page: Page): Promise<DeployedVersion> => {
  const attribute = await page
    .evaluate(() => {
      return (
        document.querySelector("[data-pwa-version]")?.getAttribute(
          "data-pwa-version"
        ) ?? null
      );
    })
    .catch(() => null);
  return (attribute ?? "v1") as DeployedVersion;
};

// Waits until the shell the page has booted is the given version (survives
// the app's auto-reload, which re-navigates to the new shell).
const waitForBootedVersion = async (
  page: Page,
  version: DeployedVersion,
  timeoutMs: number
) =>
  expect
    .poll(
      async () => bootedVersion(page),
      { message: `booted version ${version}`, timeout: timeoutMs, polling: 500 }
    )
    .toBe(version);

test.describe("PWA versioned cache and updates", () => {
  test("boots the cached shell after a deploy changes the app", async ({
    context,
    page,
  }) => {
    test.setTimeout(150_000);
    await bootMenu(page);
    await deployV2(context);

    // A second navigation (now under the activated worker) is served from the
    // fully-cached v1 shell — the altered deploy never reaches the user on
    // the navigation. Read the marker right after load, before the app's
    // background update (and any auto-reload) has a chance to run.
    await page.goto("/");
    expect(await bootedVersion(page)).toBe("v1");
  });

  test("a slow update times out, shows the failure banner, and retries next launch", async ({
    context,
    page,
  }) => {
    test.setTimeout(300_000);
    await bootMenu(page);

    // "Deploy" v2 but serve the SW's fresh index slowly (beyond the SW's 30s
    // update budget), so the background precache is aborted and the update
    // fails — the user stays on v1 and is told the update couldn't complete.
    await deployV2(context, { slowFreshIndexMs: 35_000 });

    // Open 2: the boot ping triggers the background update; the 30s budget
    // elapses and the failure surfaces as a dismissible banner on the
    // still-running v1 page.
    await page.goto("/");
    const banner = page.getByTestId("update-failure-banner");
    await expect(banner).toBeVisible({ timeout: 75_000 });
    await expect(banner).toContainText("Couldn't update the game");

    // Dismissible for this launch.
    await page.getByTestId("update-failure-dismiss").click();
    await expect(banner).toBeHidden();

    // The failed version was discarded (no partial cache): v1 still boots.
    await page.goto("/");
    expect(await bootedVersion(page)).toBe("v1");

    // The retry happens on the next launch: the dismissal doesn't persist,
    // the check re-runs and the banner comes back.
    await expect(page.getByTestId("update-failure-banner")).toBeVisible({
      timeout: 75_000,
    });
  });

  test("background update installs the new version and the reload boots it", async ({
    context,
    page,
  }) => {
    test.setTimeout(200_000);
    await bootMenu(page);
    await deployV2(context);

    // Open 2 serves the cached v1 shell; its boot ping runs the background
    // update, which precaches v2 and reports "update-ready". In the menu the
    // app auto-reloads into the new shell, so wait for the v2 shell to boot.
    await page.goto("/");
    await waitForBootedVersion(page, "v2", 120_000);
  });

  test("a new version mid-run shows a restart banner and reloads on return to the menu", async ({
    context,
    page,
  }) => {
    test.setTimeout(300_000);
    await page.addInitScript((key) => {
      localStorage.setItem(key, "1");
    }, CONTROLS_INTRO_SEEN_KEY);
    await bootMenu(page);

    // Deploy v2 with the SW's fresh index fetches delayed (the update fetches
    // the index twice — computeVersion + precacheVersion), so the update only
    // becomes "ready" ~16s in: after the run has started (a mid-run update
    // must not auto-reload — it waits for the menu) but inside the 30s budget.
    await deployV2(context, { slowFreshIndexMs: 5_000 });

    await page.goto("/");
    // Start a run; the update completes while the game is in play.
    await page.getByRole("button", { name: "Play" }).click();
    await expect(page.getByRole("heading", { name: "Deploy" })).toBeVisible();
    await page.getByTestId("level-picker-level_1").click();
    await expect(page.getByRole("heading", { name: "Tower Shop" })).toBeVisible({
      timeout: 25_000,
    });

    // Mid-run: the ready state shows a restart banner instead of reloading.
    const readyBanner = page.getByTestId("update-ready-banner");
    await expect(readyBanner).toBeVisible({ timeout: 40_000 });
    await expect(readyBanner).toContainText("New version ready");

    // Return to the main menu: "Go to Main Menu" opens an exit-confirm modal;
    // confirming it ends the run (gameStatus -> "menu"), which is the moment
    // the pending auto-reload into the new shell fires.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Game Menu" })).toBeVisible();
    await page.getByRole("button", { name: "Go to Main Menu" }).click();
    await page.getByRole("button", { name: "Proceed" }).click();
    await waitForBootedVersion(page, "v2", 120_000);
  });
});
