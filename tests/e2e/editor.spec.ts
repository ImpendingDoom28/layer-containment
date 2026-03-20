import { expect, test } from "@playwright/test";

test("loads the level editor route", async ({ page }) => {
  await page.goto("/editor");

  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Level" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Waves" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
});
