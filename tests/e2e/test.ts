import { expect, test as base } from "@playwright/test";

// Fast-forward the game simulation for the e2e suite. The wave-completion tests
// are bound by *simulation* time — a wave must be traversed by the enemies
// before it can clear — which on the GPU-less CI runner (SwiftShader) means tens
// of seconds of wall time per test. `__SIM_SPEED__` is read once at app boot
// (see `src/core/flags/simSpeed.ts`); this init script sets it before any page
// script runs, so the session advances the simulation 20× per wall second
// (sub-ticked in `GameSessionSystem`, so nothing tunnels). The override runs
// for every page via the `page` fixture, before the test's first navigation.
//
// The sim cost is a fixed amount per wall second (frame-rate independent — see
// the sub-tick loop), and the menu load ("Preparing graphics") is wall-bound
// and unaffected, so this mostly shrinks the two wave tests and the flake
// retries they forced. Non-wave tests are unaffected (the menu, settings,
// editor and the frozen testing-level scene are not sim-bound).
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((speed) => {
      (window as { __SIM_SPEED__?: number }).__SIM_SPEED__ = speed;
    }, 20);
    await use(page);
  },
});

export { expect };
