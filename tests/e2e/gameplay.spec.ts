import { expect, test } from "@playwright/test";

import { MONEY_AFTER_FIRST_BASIC_TOWER, onPlaceBasicTower } from "./fixtures/towerPlacement";
import { onOpenGame } from "./fixtures/navigation";

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
