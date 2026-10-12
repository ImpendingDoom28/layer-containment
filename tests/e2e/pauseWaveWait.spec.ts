import { expect, test } from "@playwright/test";

import { onOpenGame } from "./fixtures/navigation";

test("cannot pause while waiting for the next wave, but can pause mid-wave", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await onOpenGame(page, { waitForTowerShop: true });

  // Waiting for the first wave (nextWaveReady): pause is blocked.
  await page.keyboard.press("Space");
  await expect(page.getByTestId("paused-indicator")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Start next wave" })
  ).toBeVisible();

  // Start the wave; once it is in progress, pause is allowed again.
  await page.getByRole("button", { name: "Start next wave" }).click();
  await expect(page.getByRole("button", { name: "Start next wave" })).toBeHidden();

  await page.keyboard.press("Space");
  await expect(page.getByTestId("paused-indicator")).toBeVisible();

  // Resume mid-wave.
  await page.keyboard.press("Space");
  await expect(page.getByTestId("paused-indicator")).toBeHidden();
});
