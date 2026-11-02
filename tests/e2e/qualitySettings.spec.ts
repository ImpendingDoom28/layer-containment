import { expect, test, type Page } from "@playwright/test";

import { onOpenMainMenu } from "./fixtures/navigation";

// Settings → Quality: the graphics-quality options (bloom and shadows) live in
// their own section, separate from General. Both are on by default, toggling
// persists to the settings store, and the labels/controls are reachable from
// the main-menu settings card.

const SETTINGS_STORAGE_KEY = "containment-layer-settings-v1";

const openSettings = async (page: Page) => {
  await onOpenMainMenu(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Quality")).toBeVisible();
};

const readQualityState = async (page: Page) => {
  const raw = await page.evaluate(
    (key) => localStorage.getItem(key),
    SETTINGS_STORAGE_KEY
  );
  const state = raw
    ? (JSON.parse(raw).state as {
        bloomEnabled?: boolean;
        shadowsEnabled?: boolean;
      })
    : {};
  return state;
};

test("shows the Quality section with bloom and shadows, defaulting to on", async ({
  page,
}) => {
  await openSettings(page);

  const bloom = page.getByLabel("Bloom (glow)");
  const shadows = page.getByLabel("Shadows");
  await expect(bloom).toBeVisible();
  await expect(shadows).toBeVisible();
  await expect(bloom).toBeChecked();
  await expect(shadows).toBeChecked();
});

test("toggling shadows off persists the setting and the toggle reflects it", async ({
  page,
}) => {
  await openSettings(page);

  const shadows = page.getByLabel("Shadows");
  await shadows.uncheck();
  await expect(shadows).not.toBeChecked();
  await expect
    .poll(() => readQualityState(page), { timeout: 5_000 })
    .toEqual(expect.objectContaining({ shadowsEnabled: false }));

  // A fresh settings open reflects the persisted state.
  await page.reload();
  await openSettings(page);
  await expect(page.getByLabel("Shadows")).not.toBeChecked();
});

test("toggling bloom off persists the setting and the toggle reflects it", async ({
  page,
}) => {
  await openSettings(page);

  const bloom = page.getByLabel("Bloom (glow)");
  await bloom.uncheck();
  await expect(bloom).not.toBeChecked();
  await expect
    .poll(() => readQualityState(page), { timeout: 5_000 })
    .toEqual(expect.objectContaining({ bloomEnabled: false }));

  await page.reload();
  await openSettings(page);
  await expect(page.getByLabel("Bloom (glow)")).not.toBeChecked();
});
