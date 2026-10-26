import { expect, test, type Page } from "@playwright/test";

import { onOpenGame, onOpenMainMenu } from "./fixtures/navigation";

// These tests share the onOpenMainMenu fixture with the rest of the suite,
// which is tight under parallel-worker load (see .agents/smoke-test-handoff.md).
// Give them headroom so a slow first navigation doesn't read as a regression.
test.setTimeout(60_000);

// Settings → Controls: switching between the keyboard and the mobile (touch)
// control scheme. Each scheme is a preset of keybindings: switching replaces
// the whole binding set, persists it, and the mobile scheme additionally
// drives the on-screen D-pad on small screens.

const SETTINGS_STORAGE_KEY = "containment-layer-settings-v1";

const openSettings = async (page: Page) => {
  await onOpenMainMenu(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Controls")).toBeVisible();
};

const selectScheme = async (page: Page, scheme: "keyboard" | "mobile") => {
  await page
    .getByTestId("control-scheme-select")
    .selectOption({ label: scheme === "keyboard" ? "Keyboard" : "Touch (mobile)" });
};

const readScheme = async (page: Page) => {
  const raw = await page.evaluate((key) => localStorage.getItem(key), SETTINGS_STORAGE_KEY);
  return raw ? (JSON.parse(raw).state as { controlScheme?: string })?.controlScheme : null;
};

test("shows the control scheme switcher in Settings and applies the mobile preset", async ({
  page,
}) => {
  await openSettings(page);

  const select = page.getByTestId("control-scheme-select");
  await expect(select).toBeVisible();
  await expect(select).toHaveValue("keyboard");

  await selectScheme(page, "mobile");

  // The mobile preset binds the six camera moves to the number row.
  await expect(page.getByTestId("keybinding-row-cameraForward")).toContainText("8");
  await expect(page.getByTestId("keybinding-row-cameraBackward")).toContainText("2");
  await expect(page.getByTestId("keybinding-row-cameraLeft")).toContainText("4");
  await expect(page.getByTestId("keybinding-row-cameraRight")).toContainText("6");
  await expect(page.getByTestId("keybinding-row-cameraUp")).toContainText("9");
  await expect(page.getByTestId("keybinding-row-cameraDown")).toContainText("3");

  // The scheme persists across reloads.
  await expect
    .poll(() => readScheme(page), { timeout: 5_000 })
    .toBe("mobile");

  await page.reload();
  await openSettings(page);
  await expect(page.getByTestId("control-scheme-select")).toHaveValue("mobile");
  await expect(page.getByTestId("keybinding-row-cameraForward")).toContainText("8");
});

test("switches back to the keyboard preset and remembers it", async ({ page }) => {
  await openSettings(page);

  await selectScheme(page, "mobile");
  await expect(page.getByTestId("keybinding-row-cameraForward")).toContainText("8");

  await selectScheme(page, "keyboard");
  await expect(page.getByTestId("keybinding-row-cameraForward")).toContainText("W");
  await expect(page.getByTestId("keybinding-row-cameraUp")).toContainText("E");
  await expect
    .poll(() => readScheme(page), { timeout: 5_000 })
    .toBe("keyboard");
});

test("keeps per-key rebinding after a scheme switch", async ({ page }) => {
  await openSettings(page);

  await selectScheme(page, "mobile");
  // Rebind one control of the mobile scheme; the rest of the preset stays.
  await page.getByTestId("keybinding-row-cameraForward").click();
  await expect(page.getByTestId("keybinding-row-cameraForward")).toContainText(
    "Press a key"
  );
  await page.keyboard.press("8");
  await expect(page.getByTestId("keybinding-row-cameraForward")).toContainText("8");

  await page.getByTestId("keybinding-row-cameraLeft").click();
  await page.keyboard.press("q");
  await expect(page.getByTestId("keybinding-row-cameraLeft")).toContainText("Q");

  // The Reset button returns to the *scheme* preset (mobile), not to WASD.
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("keybinding-row-cameraLeft")).toContainText("4");
  await expect(page.getByTestId("keybinding-row-cameraForward")).toContainText("8");
});

test("shows the on-screen D-pad on mobile with the mobile scheme", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });

  await page.addInitScript(() => {
    localStorage.setItem(
      "containment-layer-controls-intro-seen",
      "1"
    );
  });
  await onOpenGame(page);
  await expect(page.getByTestId("tower-shop")).toBeVisible({ timeout: 20_000 });

  // Keyboard scheme (the default): no D-pad.
  await expect(page.getByTestId("mobile-dpad")).toBeHidden();

  // Switch to the mobile scheme from the in-game menu.
  await openInGameSettings(page);
  await selectScheme(page, "mobile");
  await closeInGameMenu(page);

  await expect(page.getByTestId("mobile-dpad")).toBeVisible();
  for (const move of ["forward", "backward", "left", "right", "up", "down"]) {
    await expect(page.getByTestId(`mobile-dpad-${move}`)).toBeVisible();
  }

  // The rotation joystick (touch analog of mouse-drag) appears too.
  await expect(page.getByTestId("mobile-joystick")).toBeVisible();
  await expect(page.getByTestId("mobile-joystick-knob")).toBeVisible();

  // Two-thumb layout: the D-pad sits on the right, the joystick on the left,
  // both above the tower shop bar in the lower half of the screen.
  const dpad = await page.getByTestId("mobile-dpad").boundingBox();
  const joystick = await page.getByTestId("mobile-joystick").boundingBox();
  const shop = await page.getByTestId("tower-shop").boundingBox();
  expect(dpad).not.toBeNull();
  expect(joystick).not.toBeNull();
  expect(shop).not.toBeNull();

  // Both in the lower half, above the shop bar.
  expect(dpad!.y).toBeGreaterThan(667 * 0.5);
  expect(dpad!.y).toBeLessThan(shop!.y);
  expect(joystick!.y).toBeGreaterThan(667 * 0.5);
  expect(joystick!.y).toBeLessThan(shop!.y);

  // D-pad on the right half, joystick on the left half.
  expect(dpad!.x + dpad!.width / 2).toBeGreaterThan(375 / 2);
  expect(joystick!.x + joystick!.width / 2).toBeLessThan(375 / 2);
});

const openInGameSettings = async (page: Page) => {
  await page.getByTestId("mobile-menu-button").click();
  await expect(page.getByRole("heading", { name: "Game Menu" })).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Controls")).toBeVisible();
};

const closeInGameMenu = async (page: Page) => {
  await page.locator('[data-slot="card-title"] button').first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Game Menu" })).toBeHidden();
};

test("hides the D-pad when switching back to the keyboard scheme on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.addInitScript(() => {
    localStorage.setItem("containment-layer-controls-intro-seen", "1");
  });
  await onOpenGame(page);
  await expect(page.getByTestId("tower-shop")).toBeVisible({ timeout: 20_000 });

  // While the game menu is open the whole in-game HUD (and the D-pad and
  // joystick with it) is hidden, so switch the scheme first, then inspect.
  await openInGameSettings(page);
  await selectScheme(page, "mobile");
  await closeInGameMenu(page);
  await expect(page.getByTestId("mobile-dpad")).toBeVisible();
  await expect(page.getByTestId("mobile-joystick")).toBeVisible();

  await openInGameSettings(page);
  await selectScheme(page, "keyboard");
  await closeInGameMenu(page);
  await expect(page.getByTestId("mobile-dpad")).toBeHidden();
  await expect(page.getByTestId("mobile-joystick")).toBeHidden();
});
