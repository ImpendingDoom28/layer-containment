import { expect, test, type Page } from "@playwright/test";

import { gamePlacementPoints } from "./fixtures/canvasPoints";

const onOpenGame = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("heading", { name: "Deploy" })).toBeVisible();
  await page.getByTestId("level-picker-level_1").click();
  await expect(page.getByRole("heading", { name: "Tower Shop" })).toBeVisible();
};

const onPlaceBasicTower = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: /Basic Tower/i }).click();

  const canvas = page.getByTestId("game-canvas");

  for (const point of gamePlacementPoints) {
    await canvas.click({ position: point });

    const towerWasPlaced =
      (await page
        .getByRole("heading", { name: "9950" })
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

  throw new Error("Unable to place a tower using the configured canvas points.");
};

test("places a basic tower and starts the first wave", async ({ page }) => {
  await onOpenGame(page);
  await onPlaceBasicTower(page);

  await expect(page.getByRole("heading", { name: "9950" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel Selection" })).toBeHidden();

  await page.getByRole("button", { name: "Start next wave" }).click();

  await expect(page.getByText("Not Started")).toBeHidden();
  await expect(page.getByText("1 / 7")).toBeVisible();
});
