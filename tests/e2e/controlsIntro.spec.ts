import { expect, test } from "@playwright/test";

import {
  CONTROLS_INTRO_SEEN_KEY,
  onOpenGame,
  onOpenGameOnFirstRun,
} from "./fixtures/navigation";

// The modal title is an h4 nested inside the Radix dialog title (an h2), so
// target the text rather than the heading role, which would match both.
const introTitle = (page: import("@playwright/test").Page) =>
  page.getByText("How to play", { exact: true });

const expectIntroVisible = (page: import("@playwright/test").Page) =>
  expect(introTitle(page)).toBeVisible({ timeout: 20_000 });

test("shows the controls intro modal on the first run and remembers it", async ({
  page,
}) => {
  await onOpenGameOnFirstRun(page);

  await expectIntroVisible(page);
  await expect(
    page.getByText('You can watch controls later in "Settings" / "Controls".')
  ).toBeVisible();

  // The default keys are listed, formatted like the Settings table.
  await expect(
    page.getByRole("dialog").getByText("W", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Space", { exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Got it" }).click();
  await expect(introTitle(page)).toBeHidden();

  const seen = await page.evaluate(
    (key) => localStorage.getItem(key),
    CONTROLS_INTRO_SEEN_KEY
  );
  expect(seen).toBe("1");
});

test("does not show the controls intro to a returning player", async ({
  page,
}) => {
  // onOpenGame marks the intro as already seen (the default), simulating a
  // player who saw it in an earlier session.
  await onOpenGame(page, { waitForTowerShop: true });

  // The run is confirmed active before asserting the absence of the modal,
  // so the test cannot pass while the game is still loading.
  await expect(
    page.getByRole("button", { name: "Start next wave" })
  ).toBeVisible();
  await expect(introTitle(page)).not.toBeVisible();
});
