import { expect, test, type Page } from "@playwright/test";

import { onOpenGame, onOpenMainMenu } from "./fixtures/navigation";

// Mobile layout checks at a typical phone portrait viewport. The HUD is
// adaptive below the 768px `md` breakpoint, so every assertion here must hold
// on a narrow screen (wide-screen checks live in the existing desktop specs).
//
// The fixture's `waitForTowerShop` option waits for the "Tower Shop" heading,
// which is desktop-only; the mobile bottom bar has no heading, so these tests
// wait for the `tower-shop` testid instead.
const MOBILE_VIEWPORT = { width: 375, height: 667 };

test.use({ viewport: MOBILE_VIEWPORT });

const openGameOnMobile = async (page: Page) => {
  await onOpenGame(page);
  await expect(page.getByTestId("tower-shop")).toBeVisible({ timeout: 20_000 });
};

test("main menu fits the mobile viewport", async ({ page }) => {
  await onOpenMainMenu(page);

  const play = page.getByRole("button", { name: "Play" });
  await expect(play).toBeVisible();

  const box = await play.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);

  // The title and the level creator link are inside the viewport as well.
  const title = page.getByRole("heading", { level: 1 }).first();
  await expect(title).toBeVisible();
  const titleBox = await title.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);

  const creator = page.getByRole("button", { name: "Level Creator" });
  await expect(creator).toBeVisible();
  const creatorBox = await creator.boundingBox();
  expect(creatorBox).not.toBeNull();
  expect(creatorBox.x + creatorBox.width).toBeLessThanOrEqual(
    MOBILE_VIEWPORT.width
  );
});

test("in-game HUD uses a bottom shop bar and a top stats strip", async ({
  page,
}) => {
  await openGameOnMobile(page);

  const shop = page.getByTestId("tower-shop");
  const shopBox = await shop.boundingBox();
  expect(shopBox).not.toBeNull();
  // The shop is a wide bar anchored to the bottom edge, not a 320px left
  // column: it spans nearly the full width and sits in the lower fifth.
  expect(shopBox.width).toBeGreaterThanOrEqual(320);
  expect(shopBox.y).toBeGreaterThan(MOBILE_VIEWPORT.height * 0.7);
  expect(shopBox.y + shopBox.height).toBeLessThanOrEqual(
    MOBILE_VIEWPORT.height
  );

  const stats = page.getByTestId("game-stats");
  const statsBox = await stats.boundingBox();
  expect(statsBox).not.toBeNull();
  expect(statsBox.y).toBeLessThanOrEqual(48);
  expect(statsBox.x + statsBox.width).toBeLessThanOrEqual(
    MOBILE_VIEWPORT.width
  );

  // Money, health, and the wave counter are all readable in the strip.
  await expect(page.getByTestId("wave-count")).toBeVisible();
  await expect(page.getByText("Wave:")).toBeVisible();

  // The mobile menu button replaces the desktop ESC entry point.
  await expect(page.getByTestId("mobile-menu-button")).toBeVisible();
});

test("a tower can be selected and deselected from the bottom shop bar", async ({
  page,
}) => {
  // The fixed camera does not frame the game field at a 375px-wide portrait
  // viewport, so placement itself cannot be exercised here; the selection
  // flow through the compact bottom bar can.
  await openGameOnMobile(page);

  const basic = page.getByRole("button", { name: /Basic Tower/i });
  await expect(basic).toBeVisible();
  await basic.click();

  // Selecting shows the compact cancel action in the bottom bar.
  await expect(page.getByTestId("tower-cancel-selection")).toBeVisible();

  await page.getByTestId("tower-cancel-selection").click();
  await expect(page.getByTestId("tower-cancel-selection")).toBeHidden();
});

test("game menu opens from the mobile menu button", async ({ page }) => {
  await openGameOnMobile(page);

  await page.getByTestId("mobile-menu-button").click();
  await expect(page.getByRole("heading", { name: "Game Menu" })).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Game Menu" })).toBeHidden();
});
