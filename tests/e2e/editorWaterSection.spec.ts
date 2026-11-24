import { expect, test } from "@playwright/test";

import { onOpenEditor } from "./fixtures/navigation";

// The inspector stays mounted across tool changes, so `defaultValue` (read
// once on mount) cannot open a section when its mode is entered; the accordion
// is controlled and (re)opens the active mode's section on mode change, while
// a section the user closed stays closed until the mode changes again.
test("opens the water section when water mode starts and honors closed sections", async ({
  page,
}) => {
  await onOpenEditor(page);

  // Fresh editor: the water section is not there yet (water mode is off).
  await expect(page.getByText("Water footprint")).not.toBeVisible();

  // The mode-rail buttons are the only <button title="..."> in the editor,
  // so title locators target the rail unambiguously; the accordion trigger is
  // scoped to the inspector panel (max-w-xl), where "Water" is unique.
  const waterRail = page.locator('button[title="Water"]');
  const inspector = page.locator("div.max-w-xl");
  const waterTrigger = inspector.getByRole("button", { name: "Water" });

  // 1. Entering water mode opens the section (inspector already mounted).
  await waterRail.click();
  await expect(waterTrigger).toBeVisible();
  await expect(page.getByText("Water footprint")).toBeVisible();

  // 2. The user can close it again, and it stays closed while in water mode.
  await waterTrigger.click();
  await expect(page.getByText("Water footprint")).not.toBeVisible();
  await expect(waterTrigger).toBeVisible();

  // 3. Leaving water mode removes the section; returning reopens it.
  await page.locator('button[title="Select"]').click();
  await expect(waterTrigger).not.toBeVisible();
  await waterRail.click();
  await expect(page.getByText("Water footprint")).toBeVisible();

  // 4. Unmodified R rotates the footprint (the keyboard guard is in place):
  //    select the north half, press R, and it becomes the east half.
  await page.getByRole("button", { name: "North half" }).click();
  const northBefore = await page
    .getByRole("button", { name: "North half" })
    .getAttribute("aria-pressed");
  const eastBefore = await page
    .getByRole("button", { name: "East half" })
    .getAttribute("aria-pressed");
  await page.keyboard.press("r");
  const northAfter = await page
    .getByRole("button", { name: "North half" })
    .getAttribute("aria-pressed");
  const eastAfter = await page
    .getByRole("button", { name: "East half" })
    .getAttribute("aria-pressed");
  expect(northBefore).toBe("true");
  expect(eastBefore).toBe("false");
  expect(northAfter).toBe("false");
  expect(eastAfter).toBe("true");

  // 5. A selected path must not block the water section: activate water while
  //    a path is still selected and the water section opens anyway.
  await page.getByRole("button", { name: "Path" }).click();
  await page.locator('button[title="Water"]').click();
  await expect(page.getByText("Water footprint")).toBeVisible();
});
