import { expect, test, type Page } from "@playwright/test";

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
