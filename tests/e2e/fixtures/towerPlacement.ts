import { expect, type Page } from "@playwright/test";

import { gamePlacementPoints } from "./canvasPoints";

export const MONEY_AFTER_FIRST_BASIC_TOWER = 100;

export const onPlaceBasicTower = async (
  page: Page,
  expectedMoneyAfter: number
): Promise<void> => {
  await page.getByRole("button", { name: /Basic Tower/i }).click();

  const canvas = page.getByTestId("game-canvas");

  for (const point of gamePlacementPoints) {
    await canvas.click({ position: point });

    const towerWasPlaced =
      (await page
        .getByRole("heading", { name: String(expectedMoneyAfter) })
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

export const onPlaceMultipleBasicTowers = async (
  page: Page,
  expectedMoneyAfterPlacements: number[]
): Promise<void> => {
  for (const expectedMoney of expectedMoneyAfterPlacements) {
    await onPlaceBasicTower(page, expectedMoney);
  }

  await expect(
    page.getByRole("button", { name: "Cancel Selection" })
  ).toBeHidden();
};
