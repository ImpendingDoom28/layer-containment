import { onOpenMainMenu, onOpenTestingLevel } from "./fixtures/navigation";
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

// The main-menu entry to the showcase only exists in dev builds
// (import.meta.env.DEV): in dev the button sits right below "Level Creator"
// and its click navigates to the (always reachable) route, while a production
// build keeps the route (asserted by the test above) but hides the entry.
test("main menu shows the dev-only Testing Level button (or hides it in production)", async ({
  page,
}) => {
  // The served HTML is the build marker: the dev server serves the source
  // index.html (favicon href "/logo.svg") while the production build rewrites
  // it to the relative base ("./logo.svg", see the vite config's base: "./").
  const html = await (await page.request.get("/")).text();
  const isDevBuild = html.includes('href="/logo.svg"');

  await onOpenMainMenu(page);

  const creator = page.getByRole("button", { name: "Level Creator" });
  await expect(creator).toBeVisible();

  const testingLevel = page.getByRole("button", { name: "Testing Level" });
  if (isDevBuild) {
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
  } else {
    await expect(testingLevel).toBeHidden();
  }
});
