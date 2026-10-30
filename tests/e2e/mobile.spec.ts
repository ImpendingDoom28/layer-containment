import { expect, test, type Locator, type Page } from "@playwright/test";

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

type Box = { x: number; y: number; width: number; height: number };

// The main menu panel animates in over 1s, so a box read right after the
// element becomes visible can catch it mid-flight; wait for the position to
// stop moving first.
const expectSettledBox = async (
  page: Page,
  locator: Locator,
  name: string
): Promise<Box> => {
  let previous: Box | null = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const box = await locator.boundingBox();
    if (box) {
      if (previous && box.x === previous.x && box.y === previous.y) {
        return box;
      }
      previous = box;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`${name} did not settle within the timeout`);
};

const openGameOnMobile = async (page: Page) => {
  await onOpenGame(page);
  await expect(page.getByTestId("tower-shop")).toBeVisible({ timeout: 20_000 });
};

test("main menu fits the mobile viewport", async ({ page }) => {
  await onOpenMainMenu(page);

  const play = page.getByRole("button", { name: "Play" });
  await expect(play).toBeVisible();
  const playBox = await expectSettledBox(page, play, "Play button");
  expect(playBox.x).toBeGreaterThanOrEqual(0);
  expect(playBox.x + playBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);

  // The title and the level creator link are inside the viewport as well.
  const title = page.getByRole("heading", { level: 1 }).first();
  await expect(title).toBeVisible();
  const titleBox = await expectSettledBox(page, title, "title");
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);

  const creator = page.getByRole("button", { name: "Level Creator" });
  await expect(creator).toBeVisible();
  const creatorBox = await expectSettledBox(page, creator, "Level Creator button");
  expect(creatorBox.x + creatorBox.width).toBeLessThanOrEqual(
    MOBILE_VIEWPORT.width
  );
});

test("in-game HUD uses a bottom shop bar and a top stats strip", async ({
  page,
}) => {
  await openGameOnMobile(page);

  const shop = page.getByTestId("tower-shop");
  const shopBox = await expectSettledBox(page, shop, "tower shop bar");
  // The shop is a wide bar anchored to the bottom edge, not a 320px left
  // column: it spans nearly the full width and sits in the lower fifth.
  expect(shopBox.width).toBeGreaterThanOrEqual(320);
  expect(shopBox.y).toBeGreaterThan(MOBILE_VIEWPORT.height * 0.7);
  expect(shopBox.y + shopBox.height).toBeLessThanOrEqual(
    MOBILE_VIEWPORT.height
  );

  const stats = page.getByTestId("game-stats");
  const statsBox = await expectSettledBox(page, stats, "stats strip");
  expect(statsBox.y).toBeLessThanOrEqual(48);
  expect(statsBox.x + statsBox.width).toBeLessThanOrEqual(
    MOBILE_VIEWPORT.width
  );

  // Money, health, and the wave counter are all readable in the strip.
  await expect(page.getByTestId("wave-count")).toBeVisible();
  await expect(page.getByText("Wave:")).toBeVisible();

  // The mobile menu button replaces the desktop ESC entry point and lives
  // inside the header strip rather than floating above it.
  const menuButton = page.getByTestId("mobile-menu-button");
  await expect(menuButton).toBeVisible();
  const header = page.getByTestId("game-stats-header");
  const headerBox = await expectSettledBox(page, header, "stats header");
  const menuBox = await menuButton.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.y).toBeGreaterThanOrEqual(headerBox.y);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(
    headerBox.y + headerBox.height
  );
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

// A landscape phone is wider than the 768px breakpoint (812px on a modern
// iPhone). The full-bleed PWA viewport (viewport-fit=cover) reports that
// width in landscape, so without the landscape-touch exception in
// `useIsMobile` the game would fall back to the desktop side-panel layout.
// `hasTouch` emulates the coarse pointer of a phone; 812x375 is the short
// side of an iPhone in landscape.
test("landscape touch phone keeps the mobile HUD layout", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 812, height: 375 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await onOpenGame(page);

    // The mobile HUD keeps the wide bottom shop bar and the top stats strip;
    // the desktop layout renders the 320px left column instead.
    const shop = page.getByTestId("tower-shop");
    const shopBox = await expectSettledBox(page, shop, "tower shop bar");
    expect(shopBox.width).toBeGreaterThanOrEqual(320);
    expect(shopBox.y).toBeGreaterThan(375 * 0.7);
    expect(shopBox.y + shopBox.height).toBeLessThanOrEqual(375);

    const statsBox = await expectSettledBox(
      page,
      page.getByTestId("game-stats"),
      "stats strip"
    );
    expect(statsBox.y).toBeLessThanOrEqual(48);
    expect(statsBox.x + statsBox.width).toBeLessThanOrEqual(812);

    // The mobile menu button replaces the desktop ESC entry point.
    await expect(page.getByTestId("mobile-menu-button")).toBeVisible();
  } finally {
    await context.close();
  }
});
