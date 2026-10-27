import { expect, test } from "@playwright/test";

import { onOpenGame, onOpenMainMenu } from "./fixtures/navigation";
import { onPlaceMultipleBasicTowers } from "./fixtures/towerPlacement";

const onWaitForMainMenuReady = async (
  page: import("@playwright/test").Page
) => {
  await expect(page.getByText("Preparing graphics")).not.toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible({
    timeout: 15_000,
  });
};

test("returns to the main menu after editor round-trip", async ({ page }) => {
  await onOpenMainMenu(page);
  await onWaitForMainMenuReady(page);

  await page.getByRole("button", { name: "Level Creator" }).click();
  await expect(page.getByTestId("editor-canvas")).toBeVisible();

  await page.getByRole("button", { name: "Back to game" }).click();
  await expect(page).toHaveURL("/");
  await onWaitForMainMenuReady(page);
});

test("clears loading after invalid route redirect", async ({ page }) => {
  await page.goto("/does-not-exist");
  await expect(page).toHaveURL("/");
  await onWaitForMainMenuReady(page);
});

test("loads the main menu and enters gameplay HUD", async ({ page }) => {
  await onOpenMainMenu(page);

  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Level Creator" })
  ).toBeVisible();

  const favicon = page.locator('link[rel="icon"]');
  await expect(favicon).toHaveAttribute("href", "/logo.svg");
  await expect(
    async () => (await page.request.get("/logo.svg")).status()
  ).resolves.toBe(200);
});

test("shows the in-game HUD after starting a run", async ({ page }) => {
  await onOpenGame(page, { waitForTowerShop: true });

  await expect(
    page.getByRole("button", { name: /Basic Tower/i })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start next wave" })
  ).toBeVisible();
  await expect(page.getByText("Wave:")).toBeVisible();
  await expect(page.getByText("Empower Next Wave")).not.toBeVisible();
});

test("opens the Almanac from the main menu, switches tabs, and returns", async ({
  page,
}) => {
  // The almanac side panel carries a 3D tilt (ui-menu-tilt) whose transform is
  // re-animated on every pointermove by useMenuParallax, including a proximity
  // lift near the left edge where the back button lives. That keeps the button
  // out of a stable position and makes Playwright click flaky, so disable the
  // parallax (and the tilt transition) by emulating reduced motion.
  await page.emulateMedia({ reducedMotion: "reduce" });

  await onOpenMainMenu(page);

  await page.getByRole("button", { name: "Almanac" }).click();

  await expect(page.getByRole("heading", { name: "Almanac" })).toBeVisible();
  await expect(page.getByRole("tablist")).toBeVisible();

  // The Enemies tab is selected by default.
  await expect(page.getByRole("tab", { name: "Enemies" })).toHaveAttribute(
    "aria-selected",
    "true"
  );

  // Switch to the Towers tab: tower cards render with names from the config.
  await page.getByRole("tab", { name: "Towers" }).click();
  await expect(page.getByRole("tab", { name: "Towers" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(page.getByText("Basic Tower")).toBeVisible();
  await expect(page.getByText("Laser Tower")).toBeVisible();

  // Non-attacking towers (relay) omit attack-only stats but keep their buff.
  const relayCard = page
    .getByText("Relay Tower", { exact: true })
    .locator("xpath=ancestor::*[@data-slot='card'][1]");
  await expect(relayCard.getByText("Neighbor buff")).toBeVisible();
  await expect(relayCard.getByText("Fire Rate")).not.toBeVisible();

  // Switch to the Upgrades tab: upgrade cards render with names from the config.
  await page.getByRole("tab", { name: "Upgrades" }).click();
  await expect(page.getByText("Armored")).toBeVisible();
  await expect(page.getByText("Regenerating")).toBeVisible();

  // Back to the Enemies tab via arrow-key navigation.
  await page.getByRole("tab", { name: "Upgrades" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Towers" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Enemies" })).toHaveAttribute(
    "aria-selected",
    "true"
  );

  await page.locator('[data-slot="card-title"] button').first().click();

  await expect(page.getByRole("button", { name: "Almanac" })).toBeVisible();
});

test("opens Settings from the main menu and closes", async ({ page }) => {
  await onOpenMainMenu(page);

  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page.getByText("Audio")).toBeVisible();
  await expect(page.getByText("General")).toBeVisible();
  await expect(page.getByText("Pause when tab is hidden")).toBeVisible();

  await page.locator('[data-slot="card-title"] button').first().click();

  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

test("shows all tower types in the shop after starting a run", async ({
  page,
}) => {
  await onOpenGame(page, { waitForTowerShop: true });

  await expect(page.getByRole("button", { name: /Slow Tower/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /AOE Tower/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Laser Tower/i })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Relay Tower/i })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Chain Lightning/i })
  ).toBeVisible();
});

test("rebinds a control in the Settings Controls section and remembers it", async ({
  page,
}) => {
  const settingsStorageKey = "containment-layer-settings-v1";

  await onOpenMainMenu(page);

  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page.getByText("Controls")).toBeVisible();
  await expect(page.getByTestId("keybinding-row-cameraForward")).toContainText(
    "W"
  );
  await expect(page.getByTestId("keybinding-row-pause")).toContainText("Space");

  // The debug toggle is a development-only keybinding and stays hidden.
  await expect(page.getByTestId("keybinding-row-toggleDebug")).toBeHidden();

  // Clicking a row arms a rebind; the row shows a "press a key" prompt.
  await page.getByTestId("keybinding-row-cameraForward").click();
  await expect(page.getByTestId("keybinding-row-cameraForward")).toContainText(
    "Press a key"
  );

  // Escape cancels the rebind without changing the binding.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("keybinding-row-cameraForward")).toContainText(
    "W"
  );

  // Rebind again and confirm with a new key.
  await page.getByTestId("keybinding-row-cameraForward").click();
  await page.keyboard.press("i");
  await expect(page.getByTestId("keybinding-row-cameraForward")).toContainText(
    "I"
  );

  // Back to the main menu, reload, and confirm the binding persisted.
  await page.locator('[data-slot="card-title"] button').first().click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();

  const persisted = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw
      ? (JSON.parse(raw).state as { keybindings: Record<string, string> })
          ?.keybindings
      : null;
  }, settingsStorageKey);
  expect(persisted?.cameraForward).toBe("KeyI");

  await page.reload();
  await onOpenMainMenu(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByTestId("keybinding-row-cameraForward")).toContainText(
    "I"
  );
});

test("opens the game menu from gameplay with Escape and resumes", async ({
  page,
}) => {
  await onOpenGame(page, { waitForTowerShop: true });

  await page.keyboard.press("Escape");

  await expect(page.getByRole("heading", { name: "Game Menu" })).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();

  await expect(page.getByRole("heading", { name: "Tower Shop" })).toBeVisible();
});

test("shows the level picker with Deploy before starting a level", async ({
  page,
}) => {
  await onOpenMainMenu(page);

  await page.getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Deploy" })).toBeVisible();
  await expect(page.getByTestId("level-picker-level_1")).toBeVisible();
  await expect(page.getByTestId("level-picker-level_2")).toBeVisible();
  await expect(page.getByTestId("level-picker-level_3")).toBeVisible();
});

test("shows Empower Next Wave after wave 1 completes and clears after pick", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await onOpenGame(page, { waitForTowerShop: true });

  await onPlaceMultipleBasicTowers(page, [100, 50]);

  await page.getByRole("button", { name: "Start next wave" }).click();

  await expect(page.getByText("Empower Next Wave")).toBeVisible({
    timeout: 120_000,
  });

  // The per-pick gold bonus must appear exactly once per upgrade card (no
  // doubled "% gold" lines).
  const upgradeCards = page.getByRole("button", {
    name: /Armored|Swift|Unstoppable|Regenerating/,
  });
  const cardCount = await upgradeCards.count();
  expect(cardCount).toBeGreaterThan(0);
  for (let i = 0; i < cardCount; i++) {
    const cardText = await upgradeCards.nth(i).innerText();
    expect((cardText.match(/gold this pick/g) ?? []).length).toBe(1);
  }

  await upgradeCards.first().click();

  await expect(page.getByText("Empower Next Wave")).toBeHidden();
});
