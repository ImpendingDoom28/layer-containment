import { expect, test } from "@playwright/test";

import { onOpenGame } from "./fixtures/navigation";

test("loads the main menu and enters gameplay HUD", async ({ page }) => {
  await page.goto("/");

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
  await expect(page.getByRole("heading", { name: "10000" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Empower Next Wave/i })
  ).not.toBeVisible();
});
