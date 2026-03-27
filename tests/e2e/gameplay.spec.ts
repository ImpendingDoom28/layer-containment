import { expect, test, type Page } from "@playwright/test";

import { gamePlacementPoints } from "./fixtures/canvasPoints";
import { onOpenGame } from "./fixtures/navigation";

const MONEY_AFTER_FIRST_BASIC_TOWER = 100;

const onPlaceBasicTower = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: /Basic Tower/i }).click();

  const canvas = page.getByTestId("game-canvas");

  for (const point of gamePlacementPoints) {
    await canvas.click({ position: point });

    const towerWasPlaced =
      (await page
        .getByRole("heading", { name: String(MONEY_AFTER_FIRST_BASIC_TOWER) })
        .isVisible()
        .catch(() => false)) &&
      (await page
        .getByRole("button", { name: "Cancel Selection" })
        .isHidden()
        .catch(() => true));

    if (towerWasPlaced) {
      return;
    }
  }

  throw new Error(
    "Unable to place a tower using the configured canvas points."
  );
};

test("places a basic tower and starts the first wave", async ({ page }) => {
  await onOpenGame(page, { waitForTowerShop: true });
  await onPlaceBasicTower(page);

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
