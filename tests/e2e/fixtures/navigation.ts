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

// Waits for the main menu to actually be interactive instead of a fixed
// sleep: the loading overlay ("Preparing graphics…") is gone and the Play
// button is present. This is the readiness signal the previous
// `waitForTimeout(2000)` was standing in for — it resolves as soon as the menu
// is ready (faster on a fast box) and blocks until it is (robust on the
// GPU-less CI runner). On hosts without a GPU (SwiftShader fallback) the
// shader-gate can take well over 2 s to resolve, so both waits get a 60s
// timeout — the budget the explicit Play-wait upstream used.
export const onWaitForMainMenuReady = async (page: Page) => {
  await expect(page.getByText("Preparing graphics")).not.toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible({
    timeout: 60_000,
  });
};

export const onOpenMainMenu = async (page: Page) => {
  await page.goto("/");
  await onWaitForMainMenuReady(page);
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

export const onOpenTestingLevel = async (page: Page) => {
  await page.goto("/testing-level");

  await expect(page.getByTestId("testing-level-canvas")).toBeVisible({
    timeout: 20_000,
  });

  await expect(page.getByTestId("hud-loading")).not.toBeVisible({
    timeout: 20_000,
  });
};
