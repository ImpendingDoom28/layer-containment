import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The real enemy GLB, served through Playwright's request interception to
// simulate a delayed or a failed model download.
const TROOP_GLB_PATH = join(
  process.cwd(),
  "public",
  "assets",
  "models",
  "troop.glb",
);

// The entry lives in stress/index.stress.html; with Vite's root at the repo
// root it is served at /stress/index.stress.html (not the main-menu flow).
const STRESS_PATH = "/stress/index.stress.html";

const onOpenStressScene = async (page: Page) => {
  await page.goto(STRESS_PATH);
  await expect(page.getByTestId("game-canvas")).toBeVisible({
    timeout: 30_000,
  });
};

/** Reads the raw text of the live stats overlay. */
const readStats = async (page: Page): Promise<string> =>
  (await page.getByTestId("stress-stats-overlay").textContent()) ?? "";

/** Extracts a value from a `LABEL   value` line of the stats overlay. */
const readStat = async (page: Page, label: string): Promise<string> => {
  const text = await readStats(page);
  const line = text.split("\n").find((l) => l.startsWith(`${label} `));
  return line?.split("  ").slice(1).join("  ").trim() ?? "";
};

const readWaveNumber = async (page: Page): Promise<number> => {
  const value = await readStat(page, "WAVE");
  const match = value.match(/^(\d+)\//);
  return match ? Number(match[1]) : 0;
};

const readFps = async (page: Page): Promise<number> => {
  const value = await readStat(page, "FPS");
  return Number(value) || 0;
};

/** Reads the `AVG <LABEL>` values from the 30-second average block. */
const readAverages = async (
  page: Page
): Promise<{ fps: number; frameMs: number; drawCalls: number } | null> => {
  const text = await readStats(page);
  const fps = text.match(/AVG FPS\s+([\d.]+)/);
  const frame = text.match(/AVG FRAME\s+([\d.]+)/);
  const draw = text.match(/AVG DRAW\s+([\d.]+)/);
  if (!fps || !frame || !draw) return null;
  return {
    fps: Number(fps[1]),
    frameMs: Number(frame[1]),
    drawCalls: Number(draw[1]),
  };
};

test("loads the stress scene with canvas and stats overlay", async ({
  page,
}) => {
  // The 64x64 scene can take a while to shader-compile before it renders
  // frames, so allow room for navigation plus the FPS poll below.
  test.setTimeout(150_000);

  await onOpenStressScene(page);

  await expect(page.getByTestId("stress-stats-overlay")).toBeVisible();

  // The 64x64 grid shader compile can take a while; wait until the scene is
  // actually rendering frames.
  await expect
    .poll(() => readFps(page), {
      timeout: 90_000,
    })
    .toBeGreaterThan(0);

  // Every 3D model must have fully loaded (no primitive fallbacks); the
  // overlay reports the run invalid if any model is still pending or failed.
  await expect
    .poll(async () => await readStat(page, "MODELS"), {
      timeout: 90_000,
    })
    .toBe("valid");
});

test("auto-advances waves without any user input", async ({ page }) => {
  test.setTimeout(120_000);

  await onOpenStressScene(page);

  // The unattended driver starts wave 1 as soon as the level loads.
  await expect
    .poll(async () => await readWaveNumber(page), {
      timeout: 90_000,
    })
    .toBeGreaterThanOrEqual(1);

  // Enemies actually spawn into the scene.
  await expect
    .poll(
      async () => {
        const value = await readStat(page, "ENEMIES");
        const match = value.match(/^(\d+)/);
        return match ? Number(match[1]) : 0;
      },
      {
        timeout: 90_000,
      }
    )
    .toBeGreaterThan(0);
});

test("reports 30-second average performance metrics", async ({ page }) => {
  test.setTimeout(180_000);

  await onOpenStressScene(page);

  // Wait until the overlay has collected a full 30-second window of frames
  // and frozen the averages. No thresholds are asserted yet: the numbers are
  // logged (test.info) so they can be used to pick baselines later.
  await expect
    .poll(async () => await readAverages(page), {
      timeout: 120_000,
    })
    .not.toBeNull();

  const averages = await readAverages(page);
  const fullOverlay = await readStats(page);
  const heap = (fullOverlay.match(/JS HEAP\s+(\S+)/)?.[1] ?? "-") as string;
  const draw = (fullOverlay.match(/AVG DRAW\s+([\d.]+)/)?.[1] ?? "-") as string;
  const tri = (fullOverlay.match(/AVG TRI\s+([\d,]+)/)?.[1] ?? "-") as string;
  const progs = (fullOverlay.match(/AVG PROGRAMS\s+(\d+)/)?.[1] ??
    "-") as string;

  const summary = [
    `avgFps=${averages?.fps}`,
    `avgFrameMs=${averages?.frameMs}`,
    `avgDrawCalls=${draw}`,
    `avgTriangles=${tri}`,
    `avgPrograms=${progs}`,
    `jsHeap=${heap}`,
  ].join(" ");

  console.log(`[stress-averages] 30s window: ${summary}`);
  test.info().annotations.push({
    type: "stress-averages",
    description: summary,
  });

  // Sanity: the scene is genuinely rendering frames during the window.
  expect(averages?.fps).toBeGreaterThan(0);
});

test("reports MODELS loading until a delayed model settles, then valid", async ({
  page,
}) => {
  // The scene is held back (MODELS loading, metrics window closed) while a
  // model is still streaming; it reports valid only once every model has
  // actually settled. Hold one enemy model's response until the test has
  // *observed* "loading" (well past the 15s cap on the shared load promise,
  // so the app must still read "loading" at that point), then release it so
  // the "valid" check runs after the model settles — no race between startup
  // timing and the delay.
  const troopGlb = await readFile(TROOP_GLB_PATH);
  let releaseHold: () => void;
  const hold = new Promise<void>((resolve) => (releaseHold = resolve));
  await page.route(/assets\/models\/troop\.glb/, async (route) => {
    await hold;
    await route.fulfill({
      status: 200,
      contentType: "model/gltf-binary",
      body: troopGlb,
    });
  });

  test.setTimeout(180_000);

  await onOpenStressScene(page);
  await expect(page.getByTestId("stress-stats-overlay")).toBeVisible();

  // While the delayed model is still streaming the run must read "loading"
  // (not "valid"), so the scene and the metrics window are held back.
  await expect
    .poll(async () => await readStat(page, "MODELS"), { timeout: 90_000 })
    .toBe("loading");

  // Release the held response: the model settles and the run becomes valid.
  releaseHold();
  await expect
    .poll(async () => await readStat(page, "MODELS"), { timeout: 120_000 })
    .toBe("valid");
});

test("marks the run invalid when a model fails to load", async ({ page }) => {
  // A model that settles to a 404 cannot be measured: the run degrades that
  // model to its primitive fallback (the existing `ModelLoader` behavior) and
  // must be reported invalid, with the average window never opened.
  await page.route(
    /assets\/models\/troop\.glb/,
    (route) => route.fulfill({ status: 404, body: "not found" }),
  );

  test.setTimeout(120_000);

  await onOpenStressScene(page);
  await expect(page.getByTestId("stress-stats-overlay")).toBeVisible();

  await expect
    .poll(async () => await readStat(page, "MODELS"), { timeout: 90_000 })
    .toBe("invalid");

  // The scene still renders (fallback primitives), but the 30s average window
  // stays closed for an invalid run.
  await expect
    .poll(() => readFps(page), { timeout: 90_000 })
    .toBeGreaterThan(0);
  const text = await readStats(page);
  expect(text).toContain("AVG WINDOW   0/30s");
});
