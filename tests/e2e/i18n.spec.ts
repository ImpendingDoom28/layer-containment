import { expect, test } from "@playwright/test";

import { onOpenMainMenu } from "./fixtures/navigation";

const SETTINGS_STORAGE_KEY = "containment-layer-settings-v1";

test("switches the UI language to Russian and persists it across reload", async ({
  page,
}) => {
  await onOpenMainMenu(page);
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  // The settings side panel slides in over ~1s; wait for the language control
  // to be visible and settled before acting on it.
  const languageSelect = page.locator("#settings-language");
  await expect(languageSelect).toBeVisible();
  await expect(languageSelect).toBeEnabled();

  await languageSelect.selectOption("ru");

  // The open settings panel switches to Russian immediately.
  await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();

  // The choice is persisted in localStorage under the settings store key.
  const stored = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { state?: { language?: string } }) : null;
  }, SETTINGS_STORAGE_KEY);
  expect(stored?.state?.language).toBe("ru");

  // After a full reload the saved language is applied before first render, so
  // the main menu comes back in Russian.
  await page.reload();
  await page.click("body");
  await expect(page.getByRole("button", { name: "Играть" })).toBeVisible({
    timeout: 15_000,
  });
});
