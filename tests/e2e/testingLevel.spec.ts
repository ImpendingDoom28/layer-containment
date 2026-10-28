import { expect, test } from "@playwright/test";

import { onOpenTestingLevel } from "./fixtures/navigation";

test("loads the testing level route", async ({ page }) => {
  await onOpenTestingLevel(page);

  await expect(
    page.getByTestId("testing-level-canvas")
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "3D Asset Showcase" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back to menu" })
  ).toBeVisible();
});
