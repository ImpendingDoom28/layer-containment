import { expect, test, type Page } from "@playwright/test";

const STRESS_PATH = "/index.stress.html";

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

test("loads the stress scene with canvas, stats overlay and banner", async ({
  page,
}) => {
  // The 64x64 scene can take a while to shader-compile before it renders
  // frames, so allow room for navigation plus the FPS poll below.
  test.setTimeout(150_000);

  await onOpenStressScene(page);

  await expect(page.getByTestId("stress-banner")).toBeVisible();
  await expect(page.getByTestId("stress-stats-overlay")).toBeVisible();
  await expect(
    page.getByText(/64x64 grid · 150 towers · 20 waves/)
  ).toBeVisible();

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
