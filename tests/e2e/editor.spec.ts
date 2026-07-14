import { expect, test } from "@playwright/test";

import { onOpenEditor } from "./fixtures/navigation";

test("loads the level editor route", async ({ page }) => {
  await onOpenEditor(page);

  await expect(page.getByRole("button", { name: "Back to game" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Level" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Waves" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
});
