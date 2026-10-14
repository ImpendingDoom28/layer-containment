import { expect, type Page } from "@playwright/test";

// The first-run controls intro flag lives in localStorage under the game id
// (see src/core/hasSeenControlsIntro.ts).
export const CONTROLS_INTRO_SEEN_KEY = "containment-layer-controls-intro-seen";

type OnOpenGameOptions = {
  waitForTowerShop?: boolean;
  /**
   * Whether to mark the controls intro as already seen before the run starts.
   * Defaults to true so existing in-game tests are not interrupted by the
   * first-run modal.
   */
  skipControlsIntro?: boolean;
};

export const onOpenMainMenu = async (page: Page) => {
  await page.goto("/");
  await page.waitForTimeout(2000);
  await page.click("body");
};

export const onOpenGame = async (
  page: Page,
  options: OnOpenGameOptions = {}
) => {
  const { waitForTowerShop = false, skipControlsIntro = true } = options;
  if (skipControlsIntro) {
    await page.addInitScript((key) => {
      localStorage.setItem(key, "1");
    }, CONTROLS_INTRO_SEEN_KEY);
  }
  await onOpenMainMenu(page);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("heading", { name: "Deploy" })).toBeVisible();
  await page.getByTestId("level-picker-level_1").click();
  if (waitForTowerShop) {
    await expect(page.getByRole("heading", { name: "Tower Shop" })).toBeVisible(
      { timeout: 20_000 }
    );
  }
};

/**
 * Starts a run with the controls intro flag cleared, so the first-run
 * controls modal is guaranteed to appear.
 */
export const onOpenGameOnFirstRun = async (page: Page) => {
  await page.addInitScript((key) => {
    localStorage.removeItem(key);
  }, CONTROLS_INTRO_SEEN_KEY);
  await onOpenMainMenu(page);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("heading", { name: "Deploy" })).toBeVisible();
  await page.getByTestId("level-picker-level_1").click();
};

export const onOpenEditor = async (page: Page) => {
  await page.goto("/editor");

  await expect(page.getByTestId("editor-canvas")).toBeVisible({
    timeout: 20_000,
  });

  await expect(page.getByText("Loading editor...")).not.toBeVisible({
    timeout: 20_000,
  });
};
