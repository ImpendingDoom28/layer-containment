import { expect, type Page } from "@playwright/test";

type OnOpenGameOptions = {
  waitForTowerShop?: boolean;
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
  const { waitForTowerShop = false } = options;
  await onOpenMainMenu(page);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("heading", { name: "Deploy" })).toBeVisible();
  await page.getByTestId("level-picker-level_1").click();
  if (waitForTowerShop) {
    await expect(
      page.getByRole("heading", { name: "Tower Shop" })
    ).toBeVisible();
  }
};
