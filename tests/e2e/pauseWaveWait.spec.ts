import { expect, test } from "@playwright/test";

import { onOpenGame } from "./fixtures/navigation";

const NO_PAUSE_TOGGLE = "No pause while waiting for the next wave";

test("blocks pause while waiting for the next wave when the setting is enabled", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await onOpenGame(page, { waitForTowerShop: true });

  // The setting is enabled by default: pausing during the wave wait is blocked.
  await page.keyboard.press("Space");
  await expect(page.getByTestId("paused-indicator")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Start next wave" })
  ).toBeVisible();

  // Turn the setting off through the in-game settings.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Game Menu" })).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("General")).toBeVisible();

  const noPauseToggle = page.getByRole("checkbox", { name: NO_PAUSE_TOGGLE });
  await expect(noPauseToggle).toBeChecked();
  await noPauseToggle.click();
  await expect(noPauseToggle).not.toBeChecked();

  // Back to the game menu, then resume. The settings back button is the
  // card-title button without a "Resume" label (the game menu one has it).
  const settingsBackButton = page.locator(
    '[data-slot="card-title"] button:not([aria-label="Resume"])'
  );
  await settingsBackButton.click();
  await expect(page.getByRole("heading", { name: "Game Menu" })).toBeVisible();

  // Resume closes the menu with a fade-out animation; wait for it to finish.
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("heading", { name: "Game Menu" })).toBeHidden();

  // With the setting disabled, pausing during the wave wait works again.
  await page.keyboard.press("Space");
  await expect(page.getByTestId("paused-indicator")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("paused-indicator")).toBeHidden();
});
