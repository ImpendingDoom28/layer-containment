import { expect, test } from "@playwright/test";

import { MONEY_AFTER_FIRST_BASIC_TOWER, onPlaceBasicTower } from "./fixtures/towerPlacement";
import { onOpenGame } from "./fixtures/navigation";

// Heavy WebGL flow (open game, place a tower on canvas, start a wave); under
// parallel workers the scene render can be slow, so give it headroom like the
// other long-running canvas tests (passes in ~10s in isolation).
test.setTimeout(90_000);

test("a short camera nudge over a tile does not place the selected tower", async ({
  page,
}) => {
  await onOpenGame(page, { waitForTowerShop: true });

  // A 4px horizontal nudge is past R3F's 2px click threshold but too small to
  // move the cursor off the tile, so the trailing `click` of the drag lands
  // back on the same tile R3F hit at pointerdown. Without a guard R3F
  // dispatches `onClick` to it and a tower is placed; the guard swallows the
  // click instead.
  await page.getByRole("button", { name: /Basic Tower/i }).click();

  const canvas = page.getByTestId("game-canvas");
  await canvas.hover({ position: { x: 720, y: 260 } });
  await page.mouse.down();
  await page.mouse.move(724, 260, { steps: 2 });
  await page.mouse.up();

  // Money is unchanged and placement mode stays active: the nudge's click was
  // swallowed instead of placing a tower.
  await expect(
    page.getByRole("heading", { name: "150" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel Selection" })
  ).toBeVisible();
});

test("places a basic tower and starts the first wave", async ({ page }) => {
  await onOpenGame(page, { waitForTowerShop: true });
  await onPlaceBasicTower(page, MONEY_AFTER_FIRST_BASIC_TOWER);

  await expect(
    page.getByRole("heading", { name: String(MONEY_AFTER_FIRST_BASIC_TOWER) })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel Selection" })
  ).toBeHidden();

  await page.getByRole("button", { name: "Start next wave" }).click();

  await expect(page.getByText("Not Started")).toBeHidden();
  await expect(page.getByText("1 / 7")).toBeVisible();
});
