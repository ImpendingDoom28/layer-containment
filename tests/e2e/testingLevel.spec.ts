import { onOpenTestingLevel } from "./fixtures/navigation";
import { expect, test } from "./test";

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

// The main-menu entry to the showcase is gated by the `?m=debug` URL flag
// (read once at boot) — not by the build type — so the menu is opened with the
// flag set; the button then sits right below "Level Creator" in every build
// (dev server and the production build the e2e suite serves), and its click
// navigates to the (always reachable) route.
test("shows a debug-flag Testing Level button below Level Creator in the main menu", async ({
  page,
}) => {
  await page.goto("/?m=debug");
  await page.waitForTimeout(2000);
  await page.click("body");

  const creator = page.getByRole("button", { name: "Level Creator" });
  await expect(creator).toBeVisible();

  const testingLevel = page.getByRole("button", { name: "Testing Level" });
  await expect(testingLevel).toBeVisible();
  // Sits directly under the level creator button.
  const creatorBox = await creator.boundingBox();
  const testBox = await testingLevel.boundingBox();
  expect(testBox.y).toBeGreaterThan(creatorBox.y);

  await testingLevel.click();
  await page.waitForURL(/\/testing-level$/, { timeout: 20_000 });
  await expect(
    page.getByTestId("testing-level-canvas")
  ).toBeVisible();
});
