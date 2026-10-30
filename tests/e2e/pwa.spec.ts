import { expect, test } from "@playwright/test";

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

  test("built stylesheet defines the HUD safe-area insets", async ({
    request,
  }) => {
    const doc = await (await request.get("/")).text();

    // Vite emits the entry stylesheet as a hashed asset linked from
    // index.html; locate it (base is "./" so the href is relative).
    const cssHref = doc
      .match(/href="([^"]*\.css)"/)
      ?.[1]
      .replace(/^\.\//, "");
    expect(cssHref, "a stylesheet link should exist in index.html").toBeTruthy();

    const css = await (await request.get(`/${cssHref}`)).text();
    // The edge-pinned HUD insets itself into the safe areas on a full-bleed
    // PWA; these utilities carry the env(safe-area-inset-*) values.
    expect(css).toContain("safe-area-inset");
    expect(css).toContain(".hud-safe-top");
    expect(css).toContain(".hud-safe-bottom");
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
