import { expect, test } from "@playwright/test";

import { onOpenGame, onOpenMainMenu } from "./fixtures/navigation";
import { onPlaceMultipleBasicTowers } from "./fixtures/towerPlacement";

test("loads the main menu and enters gameplay HUD", async ({ page }) => {
  await onOpenMainMenu(page);

  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Level Creator" })
  ).toBeVisible();
});

test("shows the in-game HUD after starting a run", async ({ page }) => {
  await onOpenGame(page);

  await expect(page.getByRole("heading", { name: "Tower Shop" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Basic Tower/i })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start next wave" })
  ).toBeVisible();
  await expect(page.getByText("Wave:")).toBeVisible();
  await expect(page.getByText("Empower Next Wave")).not.toBeVisible();
});

test("opens Enemy Almanac from the main menu and returns", async ({
  page,
}) => {
  await onOpenMainMenu(page);

  await page.getByRole("button", { name: "Enemy Almanac" }).click();

  await expect(
    page.getByRole("heading", { name: "Enemy Almanac" })
  ).toBeVisible();

  await page.locator('[data-slot="card-title"] button').first().click();

  await expect(
    page.getByRole("button", { name: "Enemy Almanac" })
  ).toBeVisible();
});

test("opens Audio Settings from the main menu and closes", async ({
  page,
}) => {
  await onOpenMainMenu(page);

  await page.getByRole("button", { name: "Audio Settings" }).click();

  await expect(page.getByText("Audio Settings")).toBeVisible();

  await page.locator('[data-slot="card-title"] button').first().click();

  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

test("shows all tower types in the shop after starting a run", async ({
  page,
}) => {
  await onOpenGame(page, { waitForTowerShop: true });

  await expect(
    page.getByRole("button", { name: /Slow Tower/i })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /AOE Tower/i })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Laser Tower/i })
  ).toBeVisible();
});

test("opens the game menu from gameplay with Escape and resumes", async ({
  page,
}) => {
  await onOpenGame(page, { waitForTowerShop: true });

  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("heading", { name: "Game Menu" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();

  await expect(
    page.getByRole("heading", { name: "Tower Shop" })
  ).toBeVisible();
});

test("shows the level picker with Deploy before starting a level", async ({
  page,
}) => {
  await onOpenMainMenu(page);

  await page.getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Deploy" })).toBeVisible();
  await expect(page.getByTestId("level-picker-level_1")).toBeVisible();
});

test(
  "shows Empower Next Wave after wave 1 completes and clears after pick",
  async ({ page }) => {
    test.setTimeout(180_000);

    await onOpenGame(page, { waitForTowerShop: true });

    await onPlaceMultipleBasicTowers(page, [100, 50]);

    await page.getByRole("button", { name: "Start next wave" }).click();

    await expect(page.getByText("Empower Next Wave")).toBeVisible({
      timeout: 120_000,
    });

    await page
      .getByRole("button", {
        name: /Armored|Swift|Unstoppable|Regenerating/,
      })
      .first()
      .click();

    await expect(page.getByText("Empower Next Wave")).toBeHidden();
  }
);
